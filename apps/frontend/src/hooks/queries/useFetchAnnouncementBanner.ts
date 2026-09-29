import { useQuery } from '@tanstack/react-query'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'

export const ANNOUNCEMENT_BANNER_QUERY_KEY = ['announcementBanner'] as const

async function fetchAnnouncementBanner(): Promise<AnnouncementBanner | null> {
  const response = await fetch('/api/UIUC-api/announcementBanner')

  if (!response.ok) {
    throw new Error(`Error fetching announcement banner: ${response.status}`)
  }

  const data: { banner: AnnouncementBanner | null } = await response.json()
  return data.banner
}

/**
 * Polled so an open tab follows admin changes; a failed poll keeps the last
 * good value. Pass the statically generated banner when the page has one so
 * the bar is in the first paint; `undefined` means the page has none and the
 * bar appears once the first fetch lands.
 */
export function useFetchAnnouncementBanner(
  initialBanner?: AnnouncementBanner | null,
) {
  return useQuery<AnnouncementBanner | null>({
    queryKey: ANNOUNCEMENT_BANNER_QUERY_KEY,
    queryFn: fetchAnnouncementBanner,
    initialData: initialBanner,
    retry: 1,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  })
}
