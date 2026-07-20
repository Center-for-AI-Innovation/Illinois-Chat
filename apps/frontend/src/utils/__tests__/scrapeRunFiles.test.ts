/* @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteScrapeRunDocuments } from '../scrapeRunFiles'

beforeEach(() => {
  // getBackendUrl() throws without RAILWAY_URL; stub it so the test is
  // self-contained and deterministic (vitest does not load .env.local).
  vi.stubEnv('RAILWAY_URL', 'http://backend.test')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('deleteScrapeRunDocuments', () => {
  it('returns zero counts and makes no calls when there are no docs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteScrapeRunDocuments('CS101', [])

    expect(result).toEqual({ deletedCount: 0, failedCount: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls the backend /delete once per doc with course_name, s3_path and url', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteScrapeRunDocuments('CS101', [
      { s3_path: 'courses/CS101/a.pdf', url: null, course_name: 'CS101' },
      { s3_path: null, url: 'https://example.com/p1', course_name: 'CS101' },
    ])

    expect(result).toEqual({ deletedCount: 2, failedCount: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstUrl = String(fetchMock.mock.calls[0]![0])
    expect(firstUrl).toContain('/delete?')
    expect(firstUrl).toContain('course_name=CS101')
    expect(firstUrl).toContain('s3_path=courses%2FCS101%2Fa.pdf')
    const secondUrl = String(fetchMock.mock.calls[1]![0])
    expect(secondUrl).toContain('url=https%3A%2F%2Fexample.com%2Fp1')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'DELETE' })
  })

  it('counts a non-ok response as a failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteScrapeRunDocuments('CS101', [
      { s3_path: 's1', url: null, course_name: 'CS101' },
      { s3_path: 's2', url: null, course_name: 'CS101' },
    ])

    expect(result).toEqual({ deletedCount: 1, failedCount: 1 })
  })

  it('counts a rejected fetch as a failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockRejectedValueOnce(new Error('network'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteScrapeRunDocuments('CS101', [
      { s3_path: 's1', url: null, course_name: 'CS101' },
      { s3_path: 's2', url: null, course_name: 'CS101' },
    ])

    expect(result).toEqual({ deletedCount: 1, failedCount: 1 })
  })
})
