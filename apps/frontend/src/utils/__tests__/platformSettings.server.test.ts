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
    exec: vi.fn(async () => []),
  }

  const client = {
    hGet: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    sMembers: vi.fn(async () => [] as string[]),
    sAdd: vi.fn(async () => 1),
    sRem: vi.fn(async () => 1),
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
    redisReturning({ hGet: vi.fn(async () => JSON.stringify(VALID_BANNER)) })

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
    redisReturning({ hGet: vi.fn(async () => JSON.stringify(VALID_BANNER)) })

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
})

describe('writePlatformSettings', () => {
  const input = {
    announcementBanner: {
      enabled: true,
      message: 'Downtime Saturday.',
      linkText: '',
      linkUrl: '',
    },
    maintenance: { enabled: true, titleText: 'Back soon', bodyText: 'Body' },
  }

  it('writes the banner and all three maintenance keys in one MULTI', async () => {
    const { multiCalls, multi } = redisReturning()

    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    const { updatedAt } = await writePlatformSettings(
      input,
      'admin@example.com',
    )

    // One logical save. A partial apply could leave maintenance on with the
    // previous notice copy.
    expect(multi.exec).toHaveBeenCalledTimes(1)
    expect(multiCalls.map(([op]) => op)).toEqual(['hSet', 'set', 'set', 'set'])

    const stored = JSON.parse(String(multiCalls[0]![1][2]))
    expect(stored).toMatchObject({
      message: 'Downtime Saturday.',
      updatedBy: 'admin@example.com',
      updatedAt,
    })
    expect(multiCalls[1]![1][1]).toBe('true')
  })

  it('writes the literal string "false" when maintenance is off', async () => {
    const { multiCalls } = redisReturning()

    const { writePlatformSettings } =
      await import('~/utils/platformSettings.server')
    await writePlatformSettings(
      { ...input, maintenance: { ...input.maintenance, enabled: false } },
      'admin@example.com',
    )

    expect(multiCalls[1]![1][1]).toBe('false')
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
    expect(client.sRem).toHaveBeenCalledWith(
      'platform:super_admins',
      'mixed@example.com',
    )
  })
})
