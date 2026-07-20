/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  axiosPost: vi.fn(),
}))

vi.mock('~/pages/api/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
}))

vi.mock('axios', () => ({
  default: { post: hoisted.axiosPost },
}))

// Avoid opening a real Postgres client (dbClient connects at import). The run
// upsert is best-effort in the handler, so a lightweight stub is enough.
vi.mock('~/db/dbClient', () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => Promise.resolve([{ id: 'run-1' }]),
        }),
      }),
    }),
  },
  scrapeMetadataRun: {
    course_name: 'course_name',
    url: 'url',
    max_urls: 'max_urls',
    scrape_strategy: 'scrape_strategy',
  },
}))

import handler from '~/pages/api/scrapeWeb'

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

    process.env.CRAWLEE_API_URL = old
  })

  it('posts to crawlee API with formatted url and match pattern', async () => {
    process.env.CRAWLEE_API_URL = 'http://crawlee'
    hoisted.axiosPost.mockResolvedValueOnce({ data: { ok: true } })

    const res = createMockRes()
    await handler(
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
    )

    expect(hoisted.axiosPost).toHaveBeenCalledWith(
      'http://crawlee',
      expect.any(Object),
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('strips a trailing slash so slash variants map to one scrape run', async () => {
    process.env.CRAWLEE_API_URL = 'http://crawlee'
    hoisted.axiosPost.mockResolvedValueOnce({ data: { ok: true } })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          url: 'https://crawl-fixture.netlify.app/',
          courseName: 'CS101',
          maxUrls: 2,
          scrapeStrategy: 'default',
        },
      }) as any,
      res as any,
    )

    // fullUrl feeds both the stored scrape-run identity and this crawlee body,
    // so a canonical (slash-stripped) value here means '.../' and '...' upsert
    // into the same run row instead of creating a duplicate empty run.
    const [, payload] = hoisted.axiosPost.mock.calls[0]
    expect(payload.params.url).toBe('https://crawl-fixture.netlify.app')
    expect(res.status).toHaveBeenCalledWith(200)
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
