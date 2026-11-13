/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  getCourseMetadata: vi.fn(),
  readNlipConfig: vi.fn(),
  verifyInboundToken: vi.fn(),
  answerProjectQuestion: vi.fn(),
}))

vi.mock('~/server/authorization', () => ({
  getCourseMetadata: hoisted.getCourseMetadata,
}))
vi.mock('~/server/nlip/config', () => ({
  readNlipConfig: hoisted.readNlipConfig,
}))
vi.mock('~/server/nlip/tokens', () => ({
  verifyInboundToken: hoisted.verifyInboundToken,
}))
vi.mock('~/server/nlip/answerProject', () => ({
  answerProjectQuestion: hoisted.answerProjectQuestion,
}))
vi.mock('~/server/nlip/client', () => ({ describeNlipError: () => ({}) }))

import handler from '~/pages/api/nlip/[course_name]'

function makeRes() {
  const res: any = {}
  res.setHeader = vi.fn()
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

const question = {
  format: 'text',
  subformat: 'english',
  content: 'What is NLIP?',
  submessages: [{ format: 'token', subformat: 'conversation', content: 'c1' }],
}
const req = (overrides: any = {}) =>
  ({
    method: 'POST',
    query: { course_name: 'B' },
    headers: { authorization: 'Bearer nlip_valid' },
    body: question,
    ...overrides,
  }) as any

const META = { id: 't1', name: 'for-A', createdAt: '2026-01-01T00:00:00Z' }

beforeEach(() => {
  hoisted.verifyInboundToken.mockImplementation(async (_p, token) =>
    token === 'nlip_valid' ? META : undefined,
  )
  hoisted.getCourseMetadata.mockResolvedValue({ is_frozen: false })
  hoisted.readNlipConfig.mockResolvedValue({
    inboundEnabled: true,
    agents: [],
  })
  hoisted.answerProjectQuestion.mockResolvedValue({
    text: 'NLIP is a protocol.',
    citations: [{ index: 1, filename: 'spec.pdf' }],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('inbound NLIP route', () => {
  it('only accepts POST', async () => {
    const res = makeRes()
    await handler(req({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('rejects malformed messages', async () => {
    const res = makeRes()
    await handler(req({ body: { format: 'text' } }), res)
    expect(res.statusCode).toBe(400)
  })

  it.each([
    ['no token', { headers: {} }],
    ['an invalid token', { headers: { authorization: 'Bearer nlip_wrong' } }],
    [
      'conflicting header and submessage tokens',
      {
        body: {
          ...question,
          submessages: [
            ...question.submessages,
            { format: 'token', subformat: 'authorization', content: 'other' },
          ],
        },
      },
    ],
  ])('returns 401 for %s', async (_case, overrides) => {
    const res = makeRes()
    await handler(req(overrides), res)
    expect(res.statusCode).toBe(401)
    expect(hoisted.answerProjectQuestion).not.toHaveBeenCalled()
  })

  it('returns 403 when inbound access is disabled', async () => {
    hoisted.readNlipConfig.mockResolvedValue({
      inboundEnabled: false,
      agents: [],
    })
    const res = makeRes()
    await handler(req(), res)
    expect(res.statusCode).toBe(403)
  })

  it('answers with citations and echoes the conversation token', async () => {
    const res = makeRes()
    await handler(req(), res)
    expect(hoisted.answerProjectQuestion).toHaveBeenCalledWith(
      'B',
      'What is NLIP?',
      'nlip:for-A',
      { is_frozen: false },
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      format: 'text',
      content: 'NLIP is a protocol.',
      submessages: [
        { format: 'token', subformat: 'conversation', content: 'c1' },
        {
          format: 'structured',
          label: 'citations',
          content: { citations: [{ index: 1, filename: 'spec.pdf' }] },
        },
      ],
    })
  })

  it('returns a generic 503 when answering fails', async () => {
    hoisted.answerProjectQuestion.mockRejectedValue(new Error('model down'))
    const res = makeRes()
    await handler(req(), res)
    expect(res.statusCode).toBe(503)
    expect(res.body.content).not.toContain('model down')
  })
})
