/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  listInboundTokens: vi.fn(),
  createInboundToken: vi.fn(),
  revokeInboundToken: vi.fn(),
}))

vi.mock('~/server/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (handler: any) => handler,
}))
vi.mock('~/server/nlip/tokens', () => ({
  MAX_NLIP_TOKENS: 20,
  listInboundTokens: hoisted.listInboundTokens,
  createInboundToken: hoisted.createInboundToken,
  revokeInboundToken: hoisted.revokeInboundToken,
}))

import { handler } from '~/pages/api/UIUC-api/tools/nlipTokens'

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

const req = (method: string, body?: unknown) =>
  ({ method, body, courseName: 'proj', user: {} }) as any

const META = { id: 't1', name: 'for-A', createdAt: '2026-01-01T00:00:00Z' }

beforeEach(() => {
  hoisted.listInboundTokens.mockResolvedValue([META])
  hoisted.createInboundToken.mockResolvedValue({ ...META, token: 'nlip_x' })
  hoisted.revokeInboundToken.mockResolvedValue(undefined)
})

describe('nlipTokens route', () => {
  it('lists token metadata', async () => {
    const res = makeRes()
    await handler(req('GET'), res)
    expect(res.body).toEqual({ tokens: [META] })
  })

  it('creates a named token and returns it once', async () => {
    const res = makeRes()
    await handler(req('POST', { name: ' for-A ' }), res)
    expect(hoisted.createInboundToken).toHaveBeenCalledWith('proj', 'for-A')
    expect(res.body).toEqual({ ...META, token: 'nlip_x' })
  })

  it('rejects a missing name and a full project', async () => {
    const empty = makeRes()
    await handler(req('POST', { name: '' }), empty)
    expect(empty.statusCode).toBe(400)

    hoisted.createInboundToken.mockResolvedValue(null)
    const full = makeRes()
    await handler(req('POST', { name: 'one more' }), full)
    expect(full.statusCode).toBe(400)
    expect(full.body.error).toMatch(/at most 20/)
  })

  it('revokes a token by id', async () => {
    const missing = makeRes()
    await handler(req('DELETE', {}), missing)
    expect(missing.statusCode).toBe(400)

    const res = makeRes()
    await handler(req('DELETE', { id: 't1' }), res)
    expect(hoisted.revokeInboundToken).toHaveBeenCalledWith('proj', 't1')
    expect(res.body).toEqual({ success: true })
  })

  it('returns 405 for other methods and 503 when storage fails', async () => {
    const put = makeRes()
    await handler(req('PUT'), put)
    expect(put.statusCode).toBe(405)

    hoisted.listInboundTokens.mockRejectedValue(new Error('redis down'))
    const res = makeRes()
    await handler(req('GET'), res)
    expect(res.statusCode).toBe(503)
  })
})
