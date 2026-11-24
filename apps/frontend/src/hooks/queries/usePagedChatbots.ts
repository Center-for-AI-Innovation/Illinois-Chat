import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { SearchChatbotsResponse } from '~/components/UIUC-Components/chatbots-hub/chatbots.types'

export type PagedChatbotsSource = 'yours' | 'course' | 'department' | 'shared'

const SOURCE_ENDPOINTS: Record<PagedChatbotsSource, string> = {
  yours: '/api/UIUC-api/getYourChatbots',
  course: '/api/UIUC-api/getCourseAssistantChatbots',
  department: '/api/UIUC-api/getDepartmentChatbots',
  shared: '/api/UIUC-api/getSharedChatbots',
}

export type PagedChatbotsParams = {
  source: PagedChatbotsSource
  offset: number
  limit: number
  sortBy?: 'created_at' | 'name'
  sortDir?: 'asc' | 'desc'
}

export async function fetchPagedChatbots({
  source,
  offset,
  limit,
  sortBy,
  sortDir,
}: PagedChatbotsParams): Promise<SearchChatbotsResponse> {
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  })
  if (sortBy) query.set('sortBy', sortBy)
  if (sortDir) query.set('sortDir', sortDir)

  const response = await fetch(`${SOURCE_ENDPOINTS[source]}?${query}`)
  if (!response.ok) {
    throw new Error(`Error fetching ${source} chatbots: ${response.status}`)
  }
  return response.json()
}

export function usePagedChatbots({
  enabled = true,
  ...params
}: PagedChatbotsParams & { enabled?: boolean }) {
  const { source, offset, limit, sortBy, sortDir } = params
  return useQuery({
    queryKey: ['pagedChatbots', source, offset, limit, sortBy, sortDir],
    queryFn: () => fetchPagedChatbots(params),
    retry: 1,
    enabled,
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
