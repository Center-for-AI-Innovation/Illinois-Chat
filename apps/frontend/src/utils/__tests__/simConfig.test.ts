/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  /** Rows keyed by course_name; `null` means the project row is absent. */
  rows: new Map<string, Record<string, unknown> | null>(),
  selectCalls: 0,
  failNext: false,
  updateCalls: [] as Array<{ set: unknown; where: unknown }>,
  failUpdate: false,
}))

vi.mock('~/db/dbClient', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (predicate: { courseName?: string }) => ({
          limit: async () => {
            hoisted.selectCalls += 1
            if (hoisted.failNext) throw new Error('connection refused')
            const row = hoisted.rows.get(predicate.courseName ?? '')
            return row ? [row] : []
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async (predicate: unknown) => {
          hoisted.updateCalls.push({ set: values, where: predicate })
          if (hoisted.failUpdate) throw new Error('write failed')
        },
      }),
    }),
  },
}))

// The real `eq` builds a SQL fragment; the fake just carries the value through
// so the mocked `where` above can look the row up.
vi.mock('drizzle-orm', () => ({
  eq: (_column: unknown, value: string) => ({ courseName: value }),
  and: (...conditions: unknown[]) => conditions,
}))

vi.mock('~/db/schema', () => ({
  projects: {
    course_name: 'course_name',
    sim_api_key: 'sim_api_key',
    sim_base_url: 'sim_base_url',
    sim_workspace_id: 'sim_workspace_id',
  },
}))

import { decryptProjectConfig, encryptProjectConfig } from '~/utils/crypto'
import {
  invalidateSimConfigCache,
  resolveSimCredentials,
  resolveStoredSimApiKey,
  simConfigErrorResponse,
  validateSimBaseUrl,
} from '../simConfig'

const MASTER_KEY = 'test-master-key'

beforeEach(() => {
  hoisted.rows.clear()
  hoisted.selectCalls = 0
  hoisted.failNext = false
  hoisted.updateCalls = []
  hoisted.failUpdate = false
  invalidateSimConfigCache()
  vi.useRealTimers()
  vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

/** Store a raw row exactly as the database would return it. */
function storeRow(course: string, row: Record<string, unknown>) {
  hoisted.rows.set(course, {
    sim_base_url: null,
    sim_workspace_id: 'ws-stored',
    ...row,
  })
}

/**
 * Store a row with the key encrypted the way `upsertSimConfig` writes it. A
 * string `sim_api_key` override is encrypted too; `null` is stored as-is.
 */
async function storeConfig(
  course: string,
  config: Partial<Record<string, string | null>> = {},
) {
  const key = 'sim_api_key' in config ? config.sim_api_key : 'sk-sim-stored'
  storeRow(course, {
    ...config,
    sim_api_key:
      typeof key === 'string' ? await encryptProjectConfig(key) : key,
  })
}

describe('resolveSimCredentials', () => {
  it('resolves from the stored project row', async () => {
    await storeConfig('proj', { sim_base_url: 'http://localhost:3010' })

    const result = await resolveSimCredentials('proj')

    expect(result).toEqual({
      ok: true,
      creds: {
        api_key: 'sk-sim-stored',
        workspace_id: 'ws-stored',
        base_url: 'http://localhost:3010',
      },
    })
    // An already-encrypted row needs no write-back.
    expect(hoisted.updateCalls).toHaveLength(0)
  })

  it('resolves a legacy plaintext row, re-encrypts it once, and then serves it from cache', async () => {
    storeRow('proj', { sim_api_key: { plaintext: 'sk-sim-legacy' } })

    const first = await resolveSimCredentials('proj')
    expect(first.ok && first.creds.api_key).toBe('sk-sim-legacy')

    expect(hoisted.updateCalls).toHaveLength(1)
    const written = hoisted.updateCalls[0]!.set as {
      sim_api_key: { encrypted: string }
    }
    expect(written.sim_api_key.encrypted).toMatch(/^v1\./)
    expect(JSON.stringify(written)).not.toContain('sk-sim-legacy')
    await expect(
      decryptProjectConfig<string>(written.sim_api_key),
    ).resolves.toBe('sk-sim-legacy')
    // The UPDATE is matched on the exact legacy value so it cannot clobber a
    // key an admin saved in the meantime.
    expect(hoisted.updateCalls[0]!.where).toEqual([
      { courseName: 'proj' },
      { courseName: { plaintext: 'sk-sim-legacy' } },
    ])

    const second = await resolveSimCredentials('proj')
    expect(second.ok && second.creds.api_key).toBe('sk-sim-legacy')
    expect(hoisted.selectCalls).toBe(1)
    expect(hoisted.updateCalls).toHaveLength(1)
  })

  it('still resolves a legacy row when the re-encrypt write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    storeRow('proj', { sim_api_key: { plaintext: 'sk-sim-legacy' } })
    hoisted.failUpdate = true

    const result = await resolveSimCredentials('proj')

    expect(result.ok && result.creds.api_key).toBe('sk-sim-legacy')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('reports decrypt_failed for an undecryptable key, does not cache it, and recovers once the key is restored', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await storeConfig('proj')

    vi.stubEnv('ENCRYPTION_MASTER_KEY', 'a-different-master-key')
    await expect(resolveSimCredentials('proj')).resolves.toEqual({
      ok: false,
      reason: 'decrypt_failed',
    })
    expect(hoisted.updateCalls).toHaveLength(0)

    vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY)
    const retried = await resolveSimCredentials('proj')
    expect(retried.ok && retried.creds.api_key).toBe('sk-sim-stored')
    expect(hoisted.selectCalls).toBe(2)
  })

  it('reports decrypt_failed for a bare-string key left by an unapplied migration', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    storeRow('proj', { sim_api_key: 'sk-sim-unmigrated' })

    await expect(resolveSimCredentials('proj')).resolves.toEqual({
      ok: false,
      reason: 'decrypt_failed',
    })
    expect(hoisted.updateCalls).toHaveLength(0)
    expect(String(error.mock.calls[0]?.[1])).toMatch(/0016/)
  })

  it('resolveStoredSimApiKey returns null for an absent key', async () => {
    await expect(resolveStoredSimApiKey('proj', null)).resolves.toBeNull()
    await expect(resolveStoredSimApiKey('proj', undefined)).resolves.toBeNull()
  })

  it('reports not_configured for a project with no key, and for no project', async () => {
    await storeConfig('blank', { sim_api_key: null })

    await expect(resolveSimCredentials('blank')).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    })
    await expect(resolveSimCredentials('missing')).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    })
    await expect(resolveSimCredentials()).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    })
  })

  it('treats an empty stored key as unconfigured rather than resolving it', async () => {
    await storeConfig('proj', { sim_api_key: '' })

    await expect(resolveSimCredentials('proj')).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    })
  })

  it('distinguishes a failed read from an unconfigured project', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await storeConfig('proj')
    hoisted.failNext = true

    await expect(resolveSimCredentials('proj')).resolves.toEqual({
      ok: false,
      reason: 'db_error',
    })
  })

  it('serves repeat reads from cache instead of re-querying', async () => {
    await storeConfig('proj')

    await resolveSimCredentials('proj')
    await resolveSimCredentials('proj')
    await resolveSimCredentials('proj')

    expect(hoisted.selectCalls).toBe(1)
  })

  it('caches per project rather than globally', async () => {
    await storeConfig('a')
    await storeConfig('b', { sim_api_key: 'sk-sim-b' })

    const first = await resolveSimCredentials('a')
    const second = await resolveSimCredentials('b')

    expect(hoisted.selectCalls).toBe(2)
    expect(first.ok && first.creds.api_key).toBe('sk-sim-stored')
    expect(second.ok && second.creds.api_key).toBe('sk-sim-b')
  })

  it('re-reads once the cached entry expires', async () => {
    vi.useFakeTimers()
    await storeConfig('proj')

    await resolveSimCredentials('proj')
    vi.advanceTimersByTime(60_001)
    await resolveSimCredentials('proj')

    expect(hoisted.selectCalls).toBe(2)
  })

  it('picks up a saved key immediately after invalidation', async () => {
    await storeConfig('proj', { sim_api_key: 'sk-sim-old' })
    const before = await resolveSimCredentials('proj')
    expect(before.ok && before.creds.api_key).toBe('sk-sim-old')

    await storeConfig('proj', { sim_api_key: 'sk-sim-new' })
    invalidateSimConfigCache('proj')
    const after = await resolveSimCredentials('proj')

    expect(after.ok && after.creds.api_key).toBe('sk-sim-new')
  })

  it('does not cache a failed read as "no configuration"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await storeConfig('proj')
    hoisted.failNext = true
    await expect(resolveSimCredentials('proj')).resolves.toEqual({
      ok: false,
      reason: 'db_error',
    })

    hoisted.failNext = false
    const retried = await resolveSimCredentials('proj')

    expect(retried.ok).toBe(true)
  })
})

describe('validateSimBaseUrl', () => {
  const cases: Array<[string, string | null]> = [
    ['https://www.sim.ai', 'https://www.sim.ai'],
    ['https://sim.ai', 'https://sim.ai'],
    ['https://api.sim.ai', 'https://api.sim.ai'],
    ['http://localhost:3010', 'http://localhost:3010'],
    ['http://127.0.0.1:3010', 'http://127.0.0.1:3010'],
    ['http://simstudio:3000', 'http://simstudio:3000'],
    // Rejections: wrong scheme, lookalike hosts, and non-URLs.
    ['http://www.sim.ai', null],
    ['https://sim.ai.evil.com', null],
    ['https://evil.com', null],
    ['https://notsim.ai', null],
    ['http://evil.com', null],
    ['file:///etc/passwd', null],
    ['not a url', null],
    ['', null],
  ]

  it.each(cases)('validates %s', (input, expected) => {
    expect(validateSimBaseUrl(input)).toBe(expected)
  })

  it('drops any path, query or fragment from an allowed URL', () => {
    expect(validateSimBaseUrl('https://www.sim.ai/foo?a=1#b')).toBe(
      'https://www.sim.ai',
    )
  })

  describe('operator-trusted origins', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it("accepts SIM_API_BASE_URL's own origin, self-hosted https included", () => {
      vi.stubEnv('SIM_API_BASE_URL', 'https://sim.internal.illinois.edu')
      expect(validateSimBaseUrl('https://sim.internal.illinois.edu')).toBe(
        'https://sim.internal.illinois.edu',
      )
      // Same host, different scheme/port is a different origin — rejected.
      expect(validateSimBaseUrl('http://sim.internal.illinois.edu')).toBeNull()
      expect(
        validateSimBaseUrl('https://sim.internal.illinois.edu:8443'),
      ).toBeNull()
    })

    it('accepts each origin in SIM_ALLOWED_SIM_ORIGINS and nothing else', () => {
      vi.stubEnv(
        'SIM_ALLOWED_SIM_ORIGINS',
        'https://sim-a.example.edu, https://sim-b.example.edu:8443',
      )
      expect(validateSimBaseUrl('https://sim-a.example.edu')).toBe(
        'https://sim-a.example.edu',
      )
      expect(validateSimBaseUrl('https://sim-b.example.edu:8443')).toBe(
        'https://sim-b.example.edu:8443',
      )
      expect(validateSimBaseUrl('https://sim-c.example.edu')).toBeNull()
    })

    it('normalizes list entries to their origin before matching', () => {
      vi.stubEnv('SIM_ALLOWED_SIM_ORIGINS', 'https://sim.example.edu/some/path')
      expect(validateSimBaseUrl('https://sim.example.edu')).toBe(
        'https://sim.example.edu',
      )
    })

    it('skips malformed entries without poisoning the rest of the list', () => {
      vi.stubEnv(
        'SIM_ALLOWED_SIM_ORIGINS',
        'not a url,,https://sim.example.edu',
      )
      expect(validateSimBaseUrl('https://sim.example.edu')).toBe(
        'https://sim.example.edu',
      )
      expect(validateSimBaseUrl('https://evil.example.com')).toBeNull()
    })

    it('still rejects arbitrary hosts when nothing is configured', () => {
      expect(validateSimBaseUrl('https://sim.internal.illinois.edu')).toBeNull()
    })
  })
})

describe('simConfigErrorResponse', () => {
  it('maps each resolution failure to a status and an actionable message', () => {
    expect(simConfigErrorResponse('missing_workspace_id')).toEqual({
      status: 400,
      error: 'Sim workspace ID is not set for this project',
    })
    expect(simConfigErrorResponse('db_error')).toEqual({
      status: 503,
      error: 'Could not read the Sim configuration for this project',
    })
    expect(simConfigErrorResponse('not_configured')).toEqual({
      status: 400,
      error: 'Sim AI is not configured for this project',
    })
    expect(simConfigErrorResponse('decrypt_failed')).toMatchObject({
      status: 503,
      error: expect.stringMatching(/ENCRYPTION_MASTER_KEY.*0016/),
    })
  })

  it('treats an unknown reason as unconfigured rather than throwing', () => {
    expect(simConfigErrorResponse('something_new' as any)).toEqual({
      status: 400,
      error: 'Sim AI is not configured for this project',
    })
  })
})

describe('config cache bound', () => {
  it('evicts the oldest project once more than 500 are cached', async () => {
    // 501 distinct projects: the first one written is pushed out by the cap.
    for (let i = 0; i <= 500; i += 1) {
      await resolveSimCredentials(`p${i}`)
    }
    expect(hoisted.selectCalls).toBe(501)

    await resolveSimCredentials('p0')
    expect(hoisted.selectCalls).toBe(502)

    // Re-inserting p0 pushed the cache over the cap again, evicting p1; p2 is
    // the oldest survivor and is still served from cache.
    await resolveSimCredentials('p2')
    expect(hoisted.selectCalls).toBe(502)
  })
})

describe('validateSimBaseUrl in production', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts a local http host only when it is the configured origin', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SIM_API_BASE_URL', 'http://localhost:3010')
    expect(validateSimBaseUrl('http://localhost:3010/api')).toBe(
      'http://localhost:3010',
    )
    expect(validateSimBaseUrl('http://localhost:9999')).toBeNull()
    expect(validateSimBaseUrl('http://127.0.0.1:3010')).toBeNull()
  })

  it('rejects every local http host when no origin is configured', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SIM_API_BASE_URL', '')
    expect(validateSimBaseUrl('http://localhost:3010')).toBeNull()
  })
})
