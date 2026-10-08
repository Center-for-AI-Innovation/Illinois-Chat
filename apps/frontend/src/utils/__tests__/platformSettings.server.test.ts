/* @vitest-environment node */

// The read path here must never throw: `readAnnouncementBanner` runs inside
// `getStaticProps`, which Next also executes at Docker build time when Redis
// is unreachable. A throw there fails the image build. The write path is the
// opposite — a swallowed error would read as a successful save.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  ensureRedisConnected: vi.fn(),
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: hoisted.ensureRedisConnected,
}))

const VALID_BANNER = {
  enabled: true,
  message: 'Downtime Saturday.',
  linkText: 'Status',
  linkUrl: 'https://status.illinois.edu',
  updatedAt: '2026-09-08T00:00:00.000Z',
  updatedBy: 'admin@example.com',
}

const VALID_BRANDING = {
  primaryWord: 'OSC',
  secondaryWord: 'Chat',
  logoVersion: 'abc123',
  updatedAt: '2026-09-08T00:00:00.000Z',
  updatedBy: 'admin@example.com',
}

const LOGO_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

/** An `hGet` that answers per hash field, like the real platform:settings hash. */
function hGetByField(fields: Record<string, string>) {
  return vi.fn(async (_key: string, field: string) => fields[field])
}

function redisReturning(overrides: Record<string, unknown> = {}) {
  const multiCalls: Array<[string, unknown[]]> = []
  const multi = {
    hSet: (...args: unknown[]) => {
      multiCalls.push(['hSet', args])
      return multi
    },
    set: (...args: unknown[]) => {
      multiCalls.push(['set', args])
      return multi
    },
    hGet: (...args: unknown[]) => {
      multiCalls.push(['hGet', args])
      return multi
    },
    get: (...args: unknown[]) => {
      multiCalls.push(['get', args])
      return multi
    },
    exec: vi.fn(async () =>
      Promise.all(
        multiCalls.map(([op, args]) =>
          op === 'hGet' ? client.hGet(...args) : client.get(...args),
        ),
      ),
    ),
  }

  const client = {
    hGet: vi.fn(async (..._args: unknown[]) => undefined),
    get: vi.fn(async (..._args: unknown[]) => null),
    sMembers: vi.fn(async () => [] as string[]),
    sAdd: vi.fn(async () => 1),
    sRem: vi.fn(async () => 1),
    eval: vi.fn(
      async (
        _script: string,
        _options: { arguments: string[]; keys: string[] },
      ) => 1,
    ),
    multi: () => multi,
    ...overrides,
  }

  hoisted.ensureRedisConnected.mockResolvedValue(client)
  return { client, multi, multiCalls }
}

beforeEach(() => {
  vi.resetModules()
  hoisted.ensureRedisConnected.mockReset()
  vi.stubEnv('SUPER_ADMIN_EMAILS', '')
  vi.stubEnv('NEXT_PUBLIC_SUPER_ADMIN_EMAILS', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('readAnnouncementBanner', () => {
  it('reports configured for a valid stored record', async () => {
    redisReturning({
      hGet: vi.fn(async (_key, field) =>
        field === 'announcement_banner'
          ? JSON.stringify(VALID_BANNER)
          : undefined,
      ),
    })

    const { readAnnouncementBanner } =
      await import('~/utils/platformSettings.server')
    const result = await readAnnouncementBanner()

    expect(result).toEqual({ state: 'configured', value: VALID_BANNER })
  })

  it('reports absent for an unset field', async () => {
    redisReturning()

    const { readAnnouncementBanner } =
      await import('~/utils/platformSettings.server')
    expect(await readAnnouncementBanner()).toEqual({ state: 'absent' })
  })

  it('reports invalid for malformed JSON instead of throwing', async () => {
    redisReturning({ hGet: vi.fn(async () => '{not json') })

    const { readAnnouncementBanner } =
      await import('~/utils/platformSettings.server')
    const result = await readAnnouncementBanner()

    expect(result.state).toBe('invalid')
  })

  it('reports invalid for a record that fails the schema', async () => {
    redisReturning({
      hGet: vi.fn(async () =>
        JSON.stringify({ ...VALID_BANNER, linkUrl: 'javascript:alert(1)' }),
      ),
    })

    const { readAnnouncementBanner } =
      await import('~/utils/platformSettings.server')
    expect((await readAnnouncementBanner()).state).toBe('invalid')
  })

  it('reports unavailable rather than throwing when Redis is down', async () => {
    hoisted.ensureRedisConnected.mockRejectedValue(new Error('ECONNREFUSED'))

    const { readAnnouncementBanner } =
      await import('~/utils/platformSettings.server')
    const result = await readAnnouncementBanner()

    // This is the build-time path. Throwing here fails `next build`.
    expect(result).toMatchObject({ state: 'unavailable' })
  })
})

describe('readMaintenanceSettings', () => {
  it('treats unset keys as maintenance simply being off', async () => {
    redisReturning()

    const { readMaintenanceSettings } =
      await import('~/utils/platformSettings.server')
    expect(await readMaintenanceSettings()).toEqual({
      state: 'configured',
      value: { enabled: false, titleText: '', bodyText: '' },
    })
  })

  it('only treats the exact string "true" as enabled', async () => {
    redisReturning({ get: vi.fn(async () => 'TRUE') })

    const { readMaintenanceSettings } =
      await import('~/utils/platformSettings.server')
    const result = await readMaintenanceSettings()
    expect(result.state === 'configured' && result.value.enabled).toBe(false)
  })

  it('reports unavailable when Redis is down', async () => {
    hoisted.ensureRedisConnected.mockRejectedValue(new Error('down'))

    const { readMaintenanceSettings } =
      await import('~/utils/platformSettings.server')
    expect((await readMaintenanceSettings()).state).toBe('unavailable')
  })
})

describe('readPlatformSettings', () => {
  it('surfaces an unreadable banner as a warning, not as saved state', async () => {
    redisReturning({ hGet: vi.fn(async () => '{not json') })

    const { readPlatformSettings } =
      await import('~/utils/platformSettings.server')
    const snapshot = await readPlatformSettings()

    // An operator must not be shown a blank form that looks like the saved
    // value, or they will overwrite a record they never saw.
    expect(snapshot.bannerState).toBe('invalid')
    expect(snapshot.warning).toContain('Announcement banner could not be read')
    expect(snapshot.settings.announcementBanner.message).toBe('')
  })

  it('carries the audit fields through when configured', async () => {
    redisReturning({
      hGet: hGetByField({ announcement_banner: JSON.stringify(VALID_BANNER) }),
    })

    const { readPlatformSettings } =
      await import('~/utils/platformSettings.server')
    const snapshot = await readPlatformSettings()

    expect(snapshot).toMatchObject({
      bannerState: 'configured',
      updatedAt: VALID_BANNER.updatedAt,
      updatedBy: VALID_BANNER.updatedBy,
    })
    expect(snapshot.warning).toBeUndefined()
  })

  it('falls back to empty maintenance copy when that read fails on its own', async () => {
    hoisted.ensureRedisConnected.mockRejectedValue(new Error('down'))

    const { readPlatformSettings } =
      await import('~/utils/platformSettings.server')
    const snapshot = await readPlatformSettings()

    expect(snapshot.bannerState).toBe('unavailable')
    expect(snapshot.settings.maintenance).toEqual({
      enabled: false,
      titleText: '',
      bodyText: '',
    })
    expect(snapshot.warning).toContain('Maintenance settings could not be read')
    expect(snapshot.updatedAt).toBeUndefined()
  })

  it('returns the default brand when navbar branding was never saved', async () => {
    redisReturning()

    const { readPlatformSettings } =
      await import('~/utils/platformSettings.server')
    const snapshot = await readPlatformSettings()

    expect(snapshot.settings.navbarBranding).toEqual({
      primaryWord: 'Illinois',
      secondaryWord: 'Chat',
      logoDataUrl: '',
    })
    expect(snapshot.warning).toBeUndefined()
  })

  it('pairs stored branding with its logo bytes', async () => {
    redisReturning({
      hGet: hGetByField({
        navbar_branding: JSON.stringify(VALID_BRANDING),
        navbar_logo: LOGO_DATA_URL,
      }),
    })

    const { readPlatformSettings } =
      await import('~/utils/platformSettings.server')
    const snapshot = await readPlatformSettings()

    expect(snapshot.settings.navbarBranding).toEqual({
      primaryWord: 'OSC',
      secondaryWord: 'Chat',
      logoDataUrl: LOGO_DATA_URL,
    })
  })

  it('keeps the words and drops the logo when no logo version is stored', async () => {
    redisReturning({
      hGet: hGetByField({
        navbar_branding: JSON.stringify({ ...VALID_BRANDING, logoVersion: '' }),
        navbar_logo: LOGO_DATA_URL,
      }),
    })

    const { readPlatformSettings } =
      await import('~/utils/platformSettings.server')
    const snapshot = await readPlatformSettings()

    expect(snapshot.settings.navbarBranding).toEqual({
      primaryWord: 'OSC',
      secondaryWord: 'Chat',
      logoDataUrl: '',
    })
  })

  it('does not keep partial branding when the snapshot read fails', async () => {
    redisReturning({
      hGet: vi.fn(async (_key: string, field: string) => {
        if (field === 'navbar_logo') throw new Error('ECONNRESET')
        return field === 'navbar_branding'
          ? JSON.stringify(VALID_BRANDING)
          : undefined
      }),
    })

    const { readPlatformSettings } =
      await import('~/utils/platformSettings.server')
    const snapshot = await readPlatformSettings()

    // Banner, branding, logo, and version are one transaction. A failure
    // cannot return the words as if that read had succeeded.
    expect(snapshot.settings.navbarBranding).toEqual({
      primaryWord: 'Illinois',
      secondaryWord: 'Chat',
      logoDataUrl: '',
    })
    expect(snapshot.warning).toContain('Navbar branding could not be read')
    expect(snapshot.warning).toContain('Navbar logo could not be read')
  })

  it('warns instead of showing defaults as saved when branding is corrupt', async () => {
    redisReturning({ hGet: hGetByField({ navbar_branding: '{not json' }) })

    const { readPlatformSettings } =
      await import('~/utils/platformSettings.server')
    const snapshot = await readPlatformSettings()

    expect(snapshot.warning).toContain('Navbar branding could not be read')
  })
})

describe('toPublicNavbarBranding', () => {
  it('links a versioned logo URL for a custom logo', async () => {
    const { toPublicNavbarBranding } =
      await import('~/utils/platformSettings.server')

    expect(
      toPublicNavbarBranding({ state: 'configured', value: VALID_BRANDING }),
    ).toEqual({
      primaryWord: 'OSC',
      secondaryWord: 'Chat',
      logoUrl: '/api/UIUC-api/navbarLogo?v=abc123',
    })
  })

  it('uses the built-in logo when no logo was uploaded', async () => {
    const { toPublicNavbarBranding } =
      await import('~/utils/platformSettings.server')

    expect(
      toPublicNavbarBranding({
        state: 'configured',
        value: { ...VALID_BRANDING, logoVersion: '' },
      }).logoUrl,
    ).toBeNull()
  })

  it.each(['absent', 'invalid', 'unavailable'] as const)(
    'falls back to the default brand when %s',
    async (state) => {
      const { toPublicNavbarBranding } =
        await import('~/utils/platformSettings.server')
      const read =
        state === 'absent' ? { state } : { state, reason: 'test' }

      expect(toPublicNavbarBranding(read)).toEqual({
        primaryWord: 'Illinois',
        secondaryWord: 'Chat',
        logoUrl: null,
      })
    },
  )
})

describe('writePlatformSettings', () => {
  const input = {
    version: '0',
    announcementBanner: {
      enabled: true,
      message: 'Downtime Saturday.',
      linkText: '',
      linkUrl: '',
    },
    maintenance: { enabled: true, titleText: 'Back soon', bodyText: 'Body' },
    navbarBranding: {
      primaryWord: 'OSC',
      secondaryWord: 'Chat',
      logoDataUrl: LOGO_DATA_URL,
    },
  }

  it('sends the expected version and edited sections in one atomic save', async () => {
    const { client } = redisReturning()
    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    const { updatedAt, version } = await writePlatformSettings(
      input,
      'admin@example.com',
    )
    expect(client.eval).toHaveBeenCalledTimes(1)
    const args = client.eval.mock.calls[0]![1].arguments
    expect(args.slice(0, 2)).toEqual(['0', version])
    expect(JSON.parse(args[2]!)).toMatchObject({
      message: input.announcementBanner.message,
      updatedAt,
      updatedBy: 'admin@example.com',
    })
    expect(args.slice(3, 6)).toEqual(['true', 'Back soon', 'Body'])
  })

  it('stores logo bytes apart from the branding record, keyed by a content hash', async () => {
    const { client } = redisReturning()

    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    await writePlatformSettings(input, 'admin@example.com')

    const args = client.eval.mock.calls[0]![1].arguments
    const branding = JSON.parse(args[8]!)
    expect(branding).toMatchObject({ primaryWord: 'OSC', secondaryWord: 'Chat' })
    expect(branding.logoVersion).toMatch(/^[0-9a-f]{16}$/)
    expect(branding).not.toHaveProperty('logoDataUrl')
    expect(args[9]).toBe(LOGO_DATA_URL)
  })

  it('clears the logo and its version when reverting to the default', async () => {
    const { client } = redisReturning()

    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    await writePlatformSettings(
      {
        ...input,
        navbarBranding: { ...input.navbarBranding, logoDataUrl: '' },
      },
      'admin@example.com',
    )

    const args = client.eval.mock.calls[0]![1].arguments
    expect(JSON.parse(args[8]!).logoVersion).toBe('')
    expect(args[9]).toBe('')
    expect(args[10]).toBe('1')
  })

  it('keeps the stored logo when a branding save leaves the logo out', async () => {
    const { client } = redisReturning()

    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    await writePlatformSettings(
      {
        version: '0',
        navbarBranding: { primaryWord: 'OSC', secondaryWord: 'Chat' },
      },
      'admin@example.com',
    )

    const args = client.eval.mock.calls[0]![1].arguments
    expect(JSON.parse(args[8]!)).toMatchObject({
      primaryWord: 'OSC',
      secondaryWord: 'Chat',
    })
    expect(args[9]).toBe('')
    expect(args[10]).toBe('0')
  })

  it('leaves the legacy banner and navbar untouched when saving only maintenance', async () => {
    const { client } = redisReturning()
    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    await writePlatformSettings(
      { version: '0', maintenance: { ...input.maintenance, enabled: false } },
      'admin@example.com',
    )
    const args = client.eval.mock.calls[0]![1].arguments
    expect(args.slice(2, 6)).toEqual(['', 'false', 'Back soon', 'Body'])
    expect(args[8]).toBe('')
    expect(args[9]).toBe('')
  })

  it('leaves maintenance untouched when saving only the banner', async () => {
    const { client } = redisReturning()
    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    await writePlatformSettings(
      { version: '0', announcementBanner: input.announcementBanner },
      'admin@example.com',
    )
    const args = client.eval.mock.calls[0]![1].arguments
    expect(JSON.parse(args[2]!)).toMatchObject({
      message: input.announcementBanner.message,
    })
    expect(args.slice(3, 6)).toEqual(['', '', ''])
  })

  it('reports a version conflict without reporting a successful save', async () => {
    redisReturning({ eval: vi.fn(async () => 0) })
    const { writePlatformSettings, PlatformSettingsConflictError } =
      await import('~/utils/platformSettings.server')
    await expect(
      writePlatformSettings(input, 'admin@example.com'),
    ).rejects.toBeInstanceOf(PlatformSettingsConflictError)
  })

  it('rejects an invalid payload before opening the transaction', async () => {
    const { multi } = redisReturning()

    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    await expect(
      writePlatformSettings(
        {
          ...input,
          announcementBanner: {
            ...input.announcementBanner,
            linkText: 'Status',
            linkUrl: 'javascript:alert(1)',
          },
        },
        'admin@example.com',
      ),
    ).rejects.toThrow()

    expect(multi.exec).not.toHaveBeenCalled()
  })

  it('propagates a Redis failure rather than reporting a save', async () => {
    hoisted.ensureRedisConnected.mockRejectedValue(new Error('down'))

    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    await expect(
      writePlatformSettings(input, 'admin@example.com'),
    ).rejects.toThrow('down')
  })
})

describe('super-admin grants', () => {
  it('lowercases and sorts the stored set', async () => {
    redisReturning({
      sMembers: vi.fn(async () => ['Zoe@example.com', 'amy@EXAMPLE.com']),
    })

    const { readSuperAdminGrants } =
      await import('~/utils/platformSettings.server')
    expect(await readSuperAdminGrants()).toEqual({
      state: 'configured',
      value: ['amy@example.com', 'zoe@example.com'],
    })
  })

  it('reports unavailable rather than throwing', async () => {
    hoisted.ensureRedisConnected.mockRejectedValue(new Error('down'))

    const { readSuperAdminGrants } =
      await import('~/utils/platformSettings.server')
    expect((await readSuperAdminGrants()).state).toBe('unavailable')
  })

  it('normalizes case on write', async () => {
    const { client } = redisReturning()

    const { addSuperAdminGrant, removeSuperAdminGrant } =
      await import('~/utils/platformSettings.server')
    await addSuperAdminGrant('Mixed@Example.com')
    await removeSuperAdminGrant('Mixed@Example.com')

    expect(client.sAdd).toHaveBeenCalledWith(
      'platform:super_admins',
      'mixed@example.com',
    )
    expect(client.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['platform:super_admins'],
      arguments: ['mixed@example.com', 'false'],
    })
  })
})
