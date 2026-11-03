/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  axiosPost: vi.fn(),
}))

vi.mock('~/server/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
}))

vi.mock('axios', () => ({
  default: { post: hoisted.axiosPost },
}))

import handler from '~/pages/api/scrapeWeb'
import { runWithLogContext } from '~/utils/server/requestContext'

describe('scrapeWeb API', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns 400 when url or courseName is missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { url: null, courseName: null },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 500 when CRAWLEE_API_URL is not set', async () => {
    const old = process.env.CRAWLEE_API_URL
    delete process.env.CRAWLEE_API_URL

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          url: 'example.com',
          courseName: 'CS101',
          maxUrls: 2,
          scrapeStrategy: 'default',
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('scraper') }),
    )

    process.env.CRAWLEE_API_URL = old
  })

  it('posts to crawlee API with formatted url and match pattern', async () => {
    process.env.CRAWLEE_API_URL = 'http://crawlee'
    hoisted.axiosPost.mockResolvedValueOnce({ data: { ok: true } })

    const res = createMockRes()
    await runWithLogContext({ rid: 'scr1' }, () =>
      handler(
        createMockReq({
          method: 'POST',
          body: {
            url: 'example.com/path',
            courseName: 'CS101',
            maxUrls: 2,
            scrapeStrategy: 'default',
          },
        }) as any,
        res as any,
      ),
    )

    expect(hoisted.axiosPost).toHaveBeenCalledWith(
      'http://crawlee',
      expect.any(Object),
      { headers: { 'X-Request-ID': 'scr1' } },
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('sends no X-Request-ID header when no request context is open', async () => {
    process.env.CRAWLEE_API_URL = 'http://crawlee'
    hoisted.axiosPost.mockResolvedValueOnce({ data: { ok: true } })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          url: 'example.com',
          courseName: 'CS101',
          maxUrls: 2,
          scrapeStrategy: 'default',
        },
      }) as any,
      res as any,
    )

    expect(hoisted.axiosPost).toHaveBeenCalledWith(
      'http://crawlee',
      expect.any(Object),
      { headers: {} },
    )
  })

  it("returns crawlee's errorMessage when the crawl fails", async () => {
    process.env.CRAWLEE_API_URL = 'http://crawlee'
    hoisted.axiosPost.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 500'), {
        response: {
          status: 500,
          data: {
            error: 'An error occurred during the upload',
            errorTitle: 'ZodError',
            errorMessage: 'url is required',
          },
        },
      }),
    )
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          url: 'example.com',
          courseName: 'CS101',
          maxUrls: 2,
          scrapeStrategy: 'default',
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'url is required' }),
    )
  })

  it('returns 500 when axios throws', async () => {
    process.env.CRAWLEE_API_URL = 'http://crawlee'
    hoisted.axiosPost.mockRejectedValueOnce(new Error('boom'))
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          url: 'example.com',
          courseName: 'CS101',
          maxUrls: 2,
          scrapeStrategy: 'default',
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
