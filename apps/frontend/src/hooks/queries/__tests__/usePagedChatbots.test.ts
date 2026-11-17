import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchPagedChatbots } from '../usePagedChatbots'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const mockFetch = (body: unknown = { results: [], total: 0 }) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('fetchPagedChatbots', () => {
  it.each([
    ['yours', '/api/UIUC-api/getYourChatbots'],
    ['course', '/api/UIUC-api/getCourseAssistantChatbots'],
    ['department', '/api/UIUC-api/getDepartmentChatbots'],
    ['shared', '/api/UIUC-api/getSharedChatbots'],
  ] as const)(
    'GETs the %s endpoint with offset and limit',
    async (source, path) => {
      const fetchMock = mockFetch()
      await fetchPagedChatbots({ source, offset: 10, limit: 5 })
      expect(fetchMock).toHaveBeenCalledWith(`${path}?offset=10&limit=5`)
    },
  )

  it('passes sort params only when given', async () => {
    const fetchMock = mockFetch()
    await fetchPagedChatbots({
      source: 'course',
      offset: 0,
      limit: 3,
      sortBy: 'name',
      sortDir: 'asc',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/UIUC-api/getCourseAssistantChatbots?offset=0&limit=3&sortBy=name&sortDir=asc',
    )
  })

  it('returns results and total', async () => {
    mockFetch({ results: [{ course_name: 'cs101' }], total: 42 })
    const data = await fetchPagedChatbots({
      source: 'yours',
      offset: 0,
      limit: 5,
    })
    expect(data.total).toBe(42)
    expect(data.results[0]?.course_name).toBe('cs101')
  })

  it('throws when the response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch
    await expect(
      fetchPagedChatbots({ source: 'shared', offset: 0, limit: 5 }),
    ).rejects.toThrow(/503/)
  })
})
