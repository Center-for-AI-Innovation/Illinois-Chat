/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const search = vi.hoisted(() => vi.fn(async (_q: string, _limit: number) => ['alpha', 'beta']))

vi.mock('~/db/projectConnectionsRepo', () => ({
  searchProjectsWithoutConnection: search,
}))

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
  res.setHeader = vi.fn()
  return res
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    headers: {},
    query: {},
    user: { email: 'admin@example.com' },
    ...overrides,
  } as any
}

beforeEach(() => {
  search.mockClear()
})

describe('projectConnections/candidates handler', () => {
  it('rejects non-GET methods with 405', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/candidates')
    const res = makeRes()
    await handler(makeReq({ method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET')
    expect(search).not.toHaveBeenCalled()
  })

  it('returns matching project names with the cap', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/candidates')
    const res = makeRes()
    await handler(makeReq({ query: { q: '  al  ' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ projects: ['alpha', 'beta'], limit: 20 })
    expect(search).toHaveBeenCalledWith('al', 20)
  })

  it('treats a missing query as an empty search', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/candidates')
    const res = makeRes()
    await handler(makeReq(), res)
    expect(search).toHaveBeenCalledWith('', 20)
  })

  it('rejects an overly long query with 400', async () => {
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/candidates')
    const res = makeRes()
    await handler(makeReq({ query: { q: 'x'.repeat(101) } }), res)
    expect(res.statusCode).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })

  it('returns 500 without leaking the database error', async () => {
    search.mockRejectedValueOnce(new Error('connection refused at 10.0.0.5'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handler } =
      await import('~/pages/api/UIUC-api/projectConnections/candidates')
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5')
  })
})
