/* @vitest-environment node */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'
import { decryptProjectConfig, encryptProjectConfig } from '~/utils/crypto'

const MASTER_KEY = 'routes-test-master-key'
const PLAIN_KEY = 'sk-sim-super-secret-value-12345678'
const MASKED_KEY = 'sk-s' + '*'.repeat(26) + '5678'

function makeRes() {
  const res: any = {}
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

const selectRows: any[] = []
const updateCalls: Array<{ set: any; returning: any[] }> = []
let updateReturning: any[] = []
const invalidated: string[] = []

beforeEach(() => {
  selectRows.length = 0
  updateCalls.length = 0
  updateReturning = [{ course_name: 'cs101' }]
  invalidated.length = 0
  vi.resetModules()
  vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY)

  vi.doMock('~/db/dbClient', () => ({
    db: {
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ limit: async () => selectRows }) }),
      })),
      update: vi.fn(() => ({
        set: (values: any) => ({
          // `where()` is both awaitable (the resolver's re-encrypt write-back
          // has no `.returning()`) and chainable (upsert awaits `.returning()`).
          // Recording happens in whichever is awaited, so nothing double-counts.
          where: () => ({
            then: (resolve: (v: unknown) => void) => {
              updateCalls.push({ set: values, returning: updateReturning })
              resolve(undefined)
            },
            returning: async () => {
              updateCalls.push({ set: values, returning: updateReturning })
              return updateReturning
            },
          }),
        }),
      })),
    },
  }))
  vi.doMock('~/utils/server/toolRouting', () => ({
    getToolRouterStatus: vi.fn(async () => ({
      status: 'default',
      provider: 'NCSAHostedVLM',
      model: 'Qwen/Qwen3.6-27B',
    })),
  }))
  vi.doMock('~/utils/simConfig', async (importOriginal) => {
    const actual: any = await importOriginal()
    return {
      ...actual,
      invalidateSimConfigCache: vi.fn((name: string) => {
        invalidated.push(name)
      }),
    }
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('~/db/dbClient')
  vi.doUnmock('~/utils/simConfig')
  vi.doUnmock('~/utils/server/toolRouting')
})

describe('getSimConfig handler', () => {
  it('never returns the API key — only a mask and a presence flag', async () => {
    const stored = await encryptProjectConfig(PLAIN_KEY)
    selectRows.push({
      sim_api_key: stored,
      sim_base_url: null,
      sim_workspace_id: 'ws-1',
    })
    const { handler } = await import('~/pages/api/UIUC-api/tools/getSimConfig')
    const res = makeRes()
    await handler({ method: 'GET', courseName: 'cs101', user: {} } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      has_api_key: true,
      sim_api_key_masked: MASKED_KEY,
      sim_base_url: null,
      sim_workspace_id: 'ws-1',
      tool_routing: {
        status: 'default',
        provider: 'NCSAHostedVLM',
        model: 'Qwen/Qwen3.6-27B',
      },
    })
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain(stored.encrypted)
    // The status never carries credentials or endpoints.
    expect(JSON.stringify(res.body.tool_routing)).not.toMatch(
      /apiKey|endpointUrl/,
    )
    expect(updateCalls).toHaveLength(0)
  })

  it('masks a legacy plaintext row and re-encrypts it in place', async () => {
    selectRows.push({
      sim_api_key: { plaintext: PLAIN_KEY },
      sim_base_url: null,
      sim_workspace_id: 'ws-1',
    })
    const { handler } = await import('~/pages/api/UIUC-api/tools/getSimConfig')
    const res = makeRes()
    await handler({ method: 'GET', courseName: 'cs101', user: {} } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.sim_api_key_masked).toBe(MASKED_KEY)
    expect(JSON.stringify(res.body)).not.toContain('super-secret')
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.set.sim_api_key.encrypted).toMatch(/^v1\./)
  })

  it('reports an unreadable stored key instead of hiding it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    selectRows.push({
      sim_api_key: { encrypted: 'v1.not-real-ciphertext.not-real-iv' },
      sim_base_url: null,
      sim_workspace_id: 'ws-1',
    })
    const { handler } = await import('~/pages/api/UIUC-api/tools/getSimConfig')
    const res = makeRes()
    await handler({ method: 'GET', courseName: 'cs101', user: {} } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      has_api_key: true,
      sim_api_key_masked: null,
      sim_api_key_error: expect.stringMatching(/could not be read/),
    })
  })

  it('reports an unconfigured project without inventing values', async () => {
    const { handler } = await import('~/pages/api/UIUC-api/tools/getSimConfig')
    const res = makeRes()
    await handler({ method: 'GET', courseName: 'cs101', user: {} } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      has_api_key: false,
      sim_api_key_masked: null,
      sim_base_url: null,
      sim_workspace_id: null,
      tool_routing: {
        status: 'default',
        provider: 'NCSAHostedVLM',
        model: 'Qwen/Qwen3.6-27B',
      },
    })
  })

  it('reports offline status without failing the config fetch when the resolver throws', async () => {
    vi.doMock('~/utils/server/toolRouting', () => ({
      getToolRouterStatus: vi.fn(async () => {
        throw new Error('redis down')
      }),
    }))
    const { handler } = await import('~/pages/api/UIUC-api/tools/getSimConfig')
    const res = makeRes()
    await handler({ method: 'GET', courseName: 'cs101', user: {} } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.tool_routing.status).toBe('offline')
  })
})

describe('upsertSimConfig handler', () => {
  const req = (body: any) =>
    ({ method: 'POST', courseName: 'cs101', user: {}, body }) as any

  // Saving a key runs discovery against Sim first; by default Sim accepts it
  // and the workspace has no deployed workflows.
  let simFetch: MockInstance<typeof fetch>
  beforeEach(() => {
    simFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }) as any,
      )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves the stored key alone when the body omits it', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_workspace_id: 'ws-2' }), res)

    expect(res.statusCode).toBe(200)
    expect(updateCalls[0]?.set).toEqual({ sim_workspace_id: 'ws-2' })
    expect(invalidated).toEqual(['cs101'])
  })

  it('accepts an allowed base URL and stores it trimmed', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_base_url: '  https://www.sim.ai  ' }), res)

    expect(res.statusCode).toBe(200)
    expect(updateCalls[0]?.set).toEqual({ sim_base_url: 'https://www.sim.ai' })
  })

  it('rejects a base URL outside the allowlist at save time', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_base_url: 'https://evil.example.com' }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/base URL/i)
    expect(res.body.fields).toEqual(['sim_base_url'])
    expect(updateCalls).toHaveLength(0)
    expect(invalidated).toEqual([])
  })

  it('clears the base URL when given blank or null', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_base_url: '   ' }), res)

    expect(res.statusCode).toBe(200)
    expect(updateCalls[0]?.set).toEqual({ sim_base_url: null })
  })

  it('stores the key as an encrypted envelope, never the plaintext', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(
      req({ sim_api_key: PLAIN_KEY, sim_workspace_id: 'ws-1' }),
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(updateCalls).toHaveLength(1)
    const stored = updateCalls[0]!.set.sim_api_key as { encrypted: string }
    expect(stored.encrypted).toMatch(/^v1\.[^.]+\.[^.]+$/)
    expect(JSON.stringify(updateCalls)).not.toContain('super-secret')
    await expect(decryptProjectConfig<string>(stored)).resolves.toBe(PLAIN_KEY)
    expect(invalidated).toEqual(['cs101'])
  })

  it('clears the key when given blank or null', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    for (const value of ['', null]) {
      const res = makeRes()
      await handler(req({ sim_api_key: value }), res)
      expect(res.statusCode).toBe(200)
    }
    expect(updateCalls.map((c) => c.set)).toEqual([
      { sim_api_key: null },
      { sim_api_key: null },
    ])
    expect(simFetch).not.toHaveBeenCalled()
  })

  it('rejects a non-string key', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_api_key: { plaintext: 'x' } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/must be a string/)
    expect(res.body.fields).toEqual(['sim_api_key'])
    expect(updateCalls).toHaveLength(0)
  })

  it('refuses to store a key when the master key is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '')
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(req({ sim_api_key: PLAIN_KEY }), res)

    expect(res.statusCode).toBe(503)
    expect(res.body.error).toMatch(/ENCRYPTION_MASTER_KEY/)
    expect(updateCalls).toHaveLength(0)
    expect(invalidated).toEqual([])
  })

  it('404s when no project row matched', async () => {
    updateReturning = []
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(
      req({ sim_api_key: 'sk-sim-x', sim_workspace_id: 'ws-1' }),
      res,
    )

    expect(res.statusCode).toBe(404)
    expect(invalidated).toEqual([])
  })
})

describe('upsertSimConfig checks the configuration with Sim before saving', () => {
  const req = (body: any) =>
    ({ method: 'POST', courseName: 'cs101', user: {}, body }) as any

  // The list call answers with `listStatus`; each workflow's detail call
  // describes it with one input field.
  const mockSim = (listStatus: number, ids: string[] = []) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('/api/v1/workflows?')) {
        return new Response(
          JSON.stringify({
            data: ids.map((id) => ({ id, name: `Flow ${id}` })),
          }),
          { status: listStatus },
        ) as any
      }
      const id = decodeURIComponent(url.split('/').pop()!)
      return new Response(
        JSON.stringify({
          data: {
            id,
            name: `Flow ${id}`,
            inputs: [{ name: 'q', type: 'string' }],
          },
        }),
        { status: 200 },
      ) as any
    })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const save = async (body: Record<string, unknown>) => {
    const { handler } =
      await import('~/pages/api/UIUC-api/tools/upsertSimConfig')
    const res = makeRes()
    await handler(req(body), res)
    return res
  }

  it('saves and returns the workflows Sim lists for the new key', async () => {
    const fetchSpy = mockSim(200, ['wf-1', 'wf-2'])
    const res = await save({
      sim_api_key: PLAIN_KEY,
      sim_workspace_id: 'ws-1',
      sim_base_url: 'https://www.sim.ai',
    })

    expect(res.statusCode).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(res.body.success).toBe(true)
    expect(res.body.workflows.map((w: any) => w.id)).toEqual(['wf-1', 'wf-2'])
    expect(res.body.failed).toEqual([])
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe(
      'https://www.sim.ai/api/v1/workflows?workspaceId=ws-1&deployedOnly=true',
    )
    expect((init as RequestInit).headers).toEqual({ 'X-API-Key': PLAIN_KEY })
  })

  it('trims a pasted key before checking and storing it', async () => {
    const fetchSpy = mockSim(200)
    const res = await save({
      sim_api_key: `  ${PLAIN_KEY}\n`,
      sim_workspace_id: 'ws-1',
    })

    expect(res.statusCode).toBe(200)
    const [, init] = fetchSpy.mock.calls[0]!
    expect((init as RequestInit).headers).toEqual({ 'X-API-Key': PLAIN_KEY })
    const stored = updateCalls[0]!.set.sim_api_key as { encrypted: string }
    await expect(decryptProjectConfig<string>(stored)).resolves.toBe(PLAIN_KEY)
  })

  it('checks a changed workspace against the stored key', async () => {
    selectRows.push({
      sim_api_key: await encryptProjectConfig(PLAIN_KEY),
      sim_base_url: null,
      sim_workspace_id: 'ws-old',
    })
    const fetchSpy = mockSim(200)
    const res = await save({ sim_workspace_id: 'ws-new', sim_base_url: null })

    expect(res.statusCode).toBe(200)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toContain('workspaceId=ws-new')
    expect((init as RequestInit).headers).toEqual({ 'X-API-Key': PLAIN_KEY })
  })

  it.each([
    [401, ['sim_api_key']],
    [403, ['sim_api_key', 'sim_workspace_id']],
    [404, ['sim_workspace_id']],
  ])(
    'does not save when Sim answers %i, and flags %j',
    async (status, fields) => {
      mockSim(status)
      const res = await save({
        sim_api_key: PLAIN_KEY,
        sim_workspace_id: 'ws-1',
      })

      expect(res.statusCode).toBe(400)
      expect(res.body.fields).toEqual(fields)
      expect(updateCalls).toHaveLength(0)
      expect(invalidated).toEqual([])
    },
  )

  it('does not save a key without a workspace, and does not call Sim', async () => {
    const fetchSpy = mockSim(200)
    const res = await save({ sim_api_key: PLAIN_KEY, sim_workspace_id: null })

    expect(res.statusCode).toBe(400)
    expect(res.body.fields).toEqual(['sim_workspace_id'])
    expect(updateCalls).toHaveLength(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not save when Sim cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('fetch failed'),
    )
    const res = await save({
      sim_api_key: PLAIN_KEY,
      sim_workspace_id: 'ws-1',
      sim_base_url: 'https://www.sim.ai',
    })

    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(
      /request to Sim at https:\/\/www.sim.ai failed/,
    )
    expect(res.body.fields).toEqual(['sim_base_url'])
    expect(updateCalls).toHaveLength(0)
  })
})
