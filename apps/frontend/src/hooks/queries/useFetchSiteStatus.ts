import { useQuery } from '@tanstack/react-query'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'

export const SITE_STATUS_QUERY_KEY = ['siteStatus'] as const

/**
 * Pages that must not show site-wide status: /admin previews the banner and
 * is where maintenance is turned off, and /silent-renew is the hidden Keycloak
 * iframe. Both the maintenance gate and the banner read this list, so they
 * cannot disagree about a page.
 */
export const SITE_STATUS_EXEMPT_PREFIXES = ['/admin', '/silent-renew'] as const

export function isSiteStatusExempt(pathname: string): boolean {
  return SITE_STATUS_EXEMPT_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  )
}

export interface SiteStatus {
  announcementBanner: AnnouncementBanner | null
  /**
   * Absent only in the entry `_app` seeds from a statically generated page,
   * which has no maintenance state. Treat absent as unknown, never as off.
   */
  isMaintenanceMode?: boolean
}

export async function fetchSiteStatus(): Promise<SiteStatus> {
  const response = await fetch('/api/UIUC-api/siteStatus')

  if (!response.ok) {
    throw new Error(`Error fetching site status: ${response.status}`)
  }

  return (await response.json()) as SiteStatus
}

/**
 * The one periodic status poll shared by the maintenance gate and the banner.
 * A failed poll throws, so React Query keeps the last successful data.
 *
 * The seeded entry is fetched on mount even when fresh, because it cannot
 * answer the maintenance question. Otherwise the gate would fail open for up
 * to a whole poll interval.
 */
export function useFetchSiteStatus({ enabled = true } = {}) {
  return useQuery<SiteStatus>({
    queryKey: SITE_STATUS_QUERY_KEY,
    queryFn: fetchSiteStatus,
    enabled,
    retry: 1,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: (query) =>
      query.state.data?.isMaintenanceMode === undefined ? 'always' : true,
  })
}
