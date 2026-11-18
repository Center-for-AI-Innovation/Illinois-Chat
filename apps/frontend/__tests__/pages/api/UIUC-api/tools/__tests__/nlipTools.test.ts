/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  getCourseMetadata: vi.fn(),
  hasCourseAccess: vi.fn(),
  fetchNlipTools: vi.fn(),
  askNlipAgent: vi.fn(),
}))

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (handler: any) => handler,
}))
vi.mock('~/server/authorization', () => ({
  getCourseMetadata: hoisted.getCourseMetadata,
  hasCourseAccess: hoisted.hasCourseAccess,
}))
vi.mock('~/server/nlip/client', () => ({
  fetchNlipTools: hoisted.fetchNlipTools,
  askNlipAgent: hoisted.askNlipAgent,
  describeNlipError: () => ({}),
}))

import nlipTools from '~/pages/api/UIUC-api/tools/nlipTools'

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

const req = (overrides: any = {}) =>
  ({
    method: 'GET',
    query: { course_name: 'proj' },
    user: { email: 'a@b.c' },
    ...overrides,
  }) as any

beforeEach(() => {
  hoisted.getCourseMetadata.mockResolvedValue({ course_owner: 'a@b.c' })
  hoisted.hasCourseAccess.mockReturnValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('nlipTools route', () => {
  it('rejects users without access to the project', async () => {
    hoisted.hasCourseAccess.mockReturnValue(false)
    const res = makeRes()
    await nlipTools(req(), res)
    expect(res.statusCode).toBe(403)
    expect(hoisted.fetchNlipTools).not.toHaveBeenCalled()
  })

  it('lists the project’s NLIP tools', async () => {
    hoisted.fetchNlipTools.mockResolvedValue([{ id: 'nlip:b_bot' }])
    const res = makeRes()
    await nlipTools(req(), res)
    expect(res.body).toEqual({ tools: [{ id: 'nlip:b_bot' }] })
  })

  it('validates the question before calling the agent', async () => {
    const res = makeRes()
    await nlipTools(req({ method: 'POST', body: { id: 'b_bot' } }), res)
    expect(res.statusCode).toBe(400)
    expect(hoisted.askNlipAgent).not.toHaveBeenCalled()
  })

  it('returns the agent’s answer', async () => {
    hoisted.askNlipAgent.mockResolvedValue({ text: 'answer' })
    const res = makeRes()
    await nlipTools(
      req({ method: 'POST', body: { id: 'b_bot', question: 'Why?' } }),
      res,
    )
    expect(hoisted.askNlipAgent).toHaveBeenCalledWith('proj', 'b_bot', 'Why?')
    expect(res.body).toEqual({ success: true, output: { text: 'answer' } })
  })

  it('hides agent failures behind a generic 502', async () => {
    hoisted.askNlipAgent.mockRejectedValue(new Error('secret upstream body'))
    const res = makeRes()
    await nlipTools(
      req({ method: 'POST', body: { id: 'b_bot', question: 'Why?' } }),
      res,
    )
    expect(res.statusCode).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })
})
