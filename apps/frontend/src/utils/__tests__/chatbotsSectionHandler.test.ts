import { beforeEach, describe, expect, it, vi } from 'vitest'

const getChatbots = vi.hoisted(() => vi.fn())

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (handler: unknown) => handler,
}))

vi.mock('~/utils/getChatbots', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getChatbots,
}))

import { chatbotsSectionHandler } from '../chatbotsSectionHandler'

type Handler = (req: unknown, res: unknown) => Promise<unknown>

const makeRes = () => {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

const call = async (
  req: { method?: string; query?: object; user?: object },
  handler = chatbotsSectionHandler(
    { user: 'others', type: 'Course' },
    'course assistant',
  ) as unknown as Handler,
) => {
  const res = makeRes()
  await handler(
    { method: 'GET', query: {}, user: { email: 'me@x.edu' }, ...req },
    res,
  )
  return res
}

beforeEach(() => {
  getChatbots.mockReset()
})

describe('chatbotsSectionHandler', () => {
  it('passes the section options and parsed page params to getChatbots', async () => {
    getChatbots.mockResolvedValue({ results: [], total: 3 })
    const res = await call({ query: { offset: '5', limit: '10' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ results: [], total: 3 })
    expect(getChatbots).toHaveBeenCalledWith({
      userEmail: 'me@x.edu',
      user: 'others',
      type: 'Course',
      offset: 5,
      limit: 10,
      sortBy: 'created_at',
      sortDir: 'desc',
    })
  })

  it.each([
    [{ method: 'POST' }, 405],
    [{ user: {} }, 400],
    [{ query: { limit: '0' } }, 400],
  ])('rejects %o with %i', async (req, status) => {
    const res = await call(req)
    expect(res.statusCode).toBe(status)
    expect(getChatbots).not.toHaveBeenCalled()
  })

  it('names the section in the 500 error', async () => {
    getChatbots.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call({})
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({
      error: 'Failed to fetch course assistant chatbots',
    })
  })
})
