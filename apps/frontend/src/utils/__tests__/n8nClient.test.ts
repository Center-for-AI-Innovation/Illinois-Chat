import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executeN8nForm,
  formatN8nFormData,
  formatN8nFormDataForWorkflow,
  getLatestN8nExecutionId,
  getN8nBaseUrl,
  getN8nExecutions,
  getN8nFormHook,
  getN8nWorkflows,
  N8nClientError,
  N8nUnauthorizedError,
  switchN8nWorkflow,
} from '../n8nClient'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  })
}

describe('n8nClient', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('N8N_URL', 'https://n8n.example')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('getN8nBaseUrl uses N8N_URL and strips a trailing slash', () => {
    vi.stubEnv('N8N_URL', 'https://n8n.example/')
    expect(getN8nBaseUrl()).toBe('https://n8n.example')
  })

  it('getN8nBaseUrl falls back to the hosted default', () => {
    vi.stubEnv('N8N_URL', '')
    expect(getN8nBaseUrl()).toBe(
      'https://primary-production-1817.up.railway.app',
    )
  })

  it('getN8nWorkflows requires an api key', async () => {
    await expect(getN8nWorkflows({ apiKey: '' })).rejects.toThrow(
      /api_key is required/,
    )
  })

  it('getN8nWorkflows returns paginated pages and follows nextCursor', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: '1', name: 'A' }],
          nextCursor: 'c1',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: '2', name: 'B' }],
        }),
      )

    const result = await getN8nWorkflows({ apiKey: 'k', limit: 10 })
    expect(result).toEqual([
      [{ id: '1', name: 'A' }],
      [{ id: '2', name: 'B' }],
    ])
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://n8n.example/api/v1/workflows?limit=10',
    )
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain('cursor=c1')
  })

  it('getN8nWorkflows returns a flat list when pagination is false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [{ id: '1', name: 'A' }] }),
    )
    await expect(
      getN8nWorkflows({ apiKey: 'k', pagination: false, active: true }),
    ).resolves.toEqual([{ id: '1', name: 'A' }])
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('active=true')
  })

  it('getN8nWorkflows returns a named workflow from the first page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [{ id: '1', name: 'Mine' }] }),
    )
    await expect(
      getN8nWorkflows({ apiKey: 'k', workflowName: 'Mine' }),
    ).resolves.toEqual({ id: '1', name: 'Mine' })
  })

  it('getN8nWorkflows throws when the named workflow is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [{ id: '1', name: 'Other' }] }),
    )
    await expect(
      getN8nWorkflows({ apiKey: 'k', workflowName: 'Mine' }),
    ).rejects.toThrow(N8nClientError)
  })

  it('getN8nWorkflows throws Unauthorized on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ message: 'unauthorized' }, { status: 401 }),
    )
    await expect(getN8nWorkflows({ apiKey: 'k' })).rejects.toBeInstanceOf(
      N8nUnauthorizedError,
    )
  })

  it('getN8nWorkflows throws on non-json error bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html>nope</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/html' },
      }),
    )
    await expect(getN8nWorkflows({ apiKey: 'k' })).rejects.toThrow(/502/)
  })

  it('getN8nWorkflows throws on non-ok JSON that is not unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ message: 'boom' }, { status: 500, statusText: 'ERR' }),
    )
    await expect(getN8nWorkflows({ apiKey: 'k' })).rejects.toThrow(/500/)
  })

  it('getN8nWorkflows throws when a cursor page fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: '1', name: 'A' }], nextCursor: 'c1' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'boom' }, { status: 500, statusText: 'ERR' }),
      )
    await expect(getN8nWorkflows({ apiKey: 'k' })).rejects.toThrow(/500/)
  })

  it('getN8nWorkflows throws Unauthorized on a cursor page', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: '1', name: 'A' }], nextCursor: 'c1' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'unauthorized' }, { status: 401 }),
      )
    await expect(getN8nWorkflows({ apiKey: 'k' })).rejects.toBeInstanceOf(
      N8nUnauthorizedError,
    )
  })

  it('getN8nExecutions returns a flat list without pagination', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [{ id: '9' }] }),
    )
    await expect(
      getN8nExecutions({ apiKey: 'k', limit: 1, pagination: false }),
    ).resolves.toEqual([{ id: '9' }])
  })

  it('getN8nExecutions finds an id without pagination', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [{ id: '9' }, { id: '10' }] }),
    )
    await expect(
      getN8nExecutions({
        apiKey: 'k',
        limit: 2,
        id: '10',
        pagination: false,
      }),
    ).resolves.toEqual({ id: '10' })
  })

  it('getN8nExecutions returns null when id is missing without pagination', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [{ id: '9' }] }),
    )
    await expect(
      getN8nExecutions({
        apiKey: 'k',
        limit: 1,
        id: 'missing',
        pagination: false,
      }),
    ).resolves.toBeNull()
  })

  it('getN8nExecutions returns pages and matches id after a cursor fetch', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: '1' }], nextCursor: 'c' }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: '2' }] }))

    await expect(
      getN8nExecutions({ apiKey: 'k', limit: 1, id: '1' }),
    ).resolves.toEqual({ id: '1' })
  })

  it('getN8nExecutions returns null when cursor-page id does not match first item', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: '1' }], nextCursor: 'c' }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: '2' }] }))

    await expect(
      getN8nExecutions({ apiKey: 'k', limit: 1, id: 'nope' }),
    ).resolves.toBeNull()
  })

  it('getN8nExecutions finds an id on the first page when there is no cursor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [{ id: '7' }] }),
    )
    await expect(
      getN8nExecutions({ apiKey: 'k', limit: 1, id: '7' }),
    ).resolves.toEqual({ id: '7' })
  })

  it('getN8nExecutions returns collected pages when no id is requested', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: '1' }], nextCursor: 'c' }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: '2' }] }))

    await expect(getN8nExecutions({ apiKey: 'k', limit: 1 })).resolves.toEqual([
      [{ id: '1' }],
      [{ id: '2' }],
    ])
  })

  it('getN8nExecutions throws Unauthorized on a cursor page', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: '1' }], nextCursor: 'c' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'unauthorized' }, { status: 401 }),
      )
    await expect(getN8nExecutions({ apiKey: 'k', limit: 1 })).rejects.toBeInstanceOf(
      N8nUnauthorizedError,
    )
  })

  it('getN8nExecutions throws on non-ok and unauthorized responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ message: 'unauthorized' }, { status: 401 }),
    )
    await expect(
      getN8nExecutions({ apiKey: 'k', limit: 1 }),
    ).rejects.toBeInstanceOf(N8nUnauthorizedError)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ message: 'boom' }, { status: 500, statusText: 'ERR' }),
    )
    await expect(getN8nExecutions({ apiKey: 'k', limit: 1 })).rejects.toThrow(
      /500/,
    )
  })

  it('getN8nExecutions throws when a cursor page fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: '1' }], nextCursor: 'c' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'boom' }, { status: 500, statusText: 'ERR' }),
      )
    await expect(getN8nExecutions({ apiKey: 'k', limit: 1 })).rejects.toThrow(
      /500/,
    )
  })

  it('getLatestN8nExecutionId increments the latest id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [{ id: '41' }] }),
    )
    await expect(getLatestN8nExecutionId('k')).resolves.toBe(42)
  })

  it('getLatestN8nExecutionId throws when there are no executions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ data: [] }))
    await expect(getLatestN8nExecutionId('k')).rejects.toThrow(
      /No executions found/,
    )
  })

  it('switchN8nWorkflow activates and deactivates', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({ ok: true }),
    )

    await expect(
      switchN8nWorkflow({ apiKey: 'k', id: '1', activate: 'True' }),
    ).resolves.toEqual({ ok: true })
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/activate')

    await switchN8nWorkflow({ apiKey: 'k', id: '1', activate: 'false' })
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain('/deactivate')
  })

  it('switchN8nWorkflow throws Unauthorized and other errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ message: 'unauthorized' }, { status: 401 }),
    )
    await expect(
      switchN8nWorkflow({ apiKey: 'k', id: '1', activate: 'true' }),
    ).rejects.toBeInstanceOf(N8nUnauthorizedError)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ message: 'nope' }, { status: 400, statusText: 'Bad' }),
    )
    await expect(
      switchN8nWorkflow({ apiKey: 'k', id: '1', activate: 'true' }),
    ).rejects.toThrow(/nope/)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({}, { status: 400, statusText: 'Bad' }),
    )
    await expect(
      switchN8nWorkflow({ apiKey: 'k', id: '1', activate: 'true' }),
    ).rejects.toThrow(/Failed to activate workflow: 400 Bad/)
  })

  it('getN8nFormHook returns the form trigger path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: '1',
            name: 'Mine',
            nodes: [
              { name: 'n8n Form Trigger', parameters: { path: 'abc' } },
            ],
          },
        ],
      }),
    )
    await expect(getN8nFormHook('k', 'Mine')).resolves.toBe('abc')
  })

  it('getN8nFormHook throws when the trigger node is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: '1', name: 'Mine', nodes: [{ name: 'Other' }] }],
      }),
    )
    await expect(getN8nFormHook('k', 'Mine')).rejects.toThrow(/No nodes found/)
  })

  it('formatN8nFormData maps labels, stringifies arrays, and swallows errors', () => {
    const workflow = {
      id: '1',
      name: 'W',
      nodes: [
        {
          name: 'n8n Form Trigger',
          parameters: {
            formFields: {
              values: [{ fieldLabel: 'Query' }, { fieldLabel: 'Tags' }],
            },
          },
        },
      ],
    }
    expect(
      formatN8nFormData({ Query: 'hi', Tags: ['a', 'b'], Extra: 1 }, workflow),
    ).toEqual({ 'field-0': 'hi', 'field-1': '["a","b"]' })
    expect(formatN8nFormData('{not json', workflow)).toBeUndefined()
    expect(formatN8nFormData(null, workflow)).toBeUndefined()
    expect(
      formatN8nFormData(JSON.stringify({ Query: 'x' }), workflow),
    ).toEqual({ 'field-0': 'x' })
  })

  it('formatN8nFormDataForWorkflow returns undefined when lookup fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ data: [] }),
    )
    await expect(
      formatN8nFormDataForWorkflow({ Query: 'x' }, 'k', 'Missing'),
    ).resolves.toBeUndefined()
  })

  it('formatN8nFormDataForWorkflow formats a found workflow', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: '1',
            name: 'Mine',
            nodes: [
              {
                name: 'n8n Form Trigger',
                parameters: {
                  formFields: { values: [{ fieldLabel: 'Query' }] },
                },
              },
            ],
          },
        ],
      }),
    )
    await expect(
      formatN8nFormDataForWorkflow({ Query: 'hi' }, 'k', 'Mine'),
    ).resolves.toEqual({ 'field-0': 'hi' })
  })

  it('executeN8nForm posts multipart data and throws on failure', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await executeN8nForm('hook', { 'field-0': 'v' })
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      'https://n8n.example/form/hook',
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 500 }),
    )
    await expect(executeN8nForm('hook', undefined)).rejects.toThrow(/Error: 500/)
  })

  it('getN8nWorkflows treats missing data as an empty page and honors a live abort signal', async () => {
    const controller = new AbortController()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({}),
    )
    await expect(
      getN8nWorkflows({ apiKey: 'k', signal: controller.signal }),
    ).resolves.toEqual([[]])
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('getN8nExecutions and switchN8nWorkflow require an api key', async () => {
    await expect(getN8nExecutions({ apiKey: '', limit: 1 })).rejects.toThrow(
      /api_key is required/,
    )
    await expect(
      switchN8nWorkflow({ apiKey: '', id: '1', activate: 'true' }),
    ).rejects.toThrow(/api_key is required/)
  })

  it('executeN8nForm aborts when the caller signal is already aborted', async () => {
    const signal = AbortSignal.abort()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.signal?.aborted) {
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      }
      return new Response('ok', { status: 200 })
    })
    await expect(executeN8nForm('hook', { 'field-0': 'v' }, signal)).rejects.toThrow(
      /aborted/,
    )
  })

  it('aborts in-flight n8n fetches when the caller signal is already aborted', async () => {
    const signal = AbortSignal.abort()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.signal?.aborted) {
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      }
      return jsonResponse({ data: [] })
    })
    await expect(
      getN8nWorkflows({ apiKey: 'k', signal }),
    ).rejects.toThrow(/aborted/)
  })
})
