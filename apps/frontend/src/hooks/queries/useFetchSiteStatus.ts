import { useQuery } from '@tanstack/react-query'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'

export const SITE_STATUS_QUERY_KEY = ['siteStatus'] as const

/**
 * Two separate policies over the one status query, because the gate and the
 * banner need different things from the same page:
 *
 * - Maintenance bypass: the gate never replaces these pages. /admin is where
 *   an operator turns maintenance back off, and /silent-renew is the OIDC
 *   renewal target. Gating either makes maintenance unrecoverable.
 * - Status polling: pages that make no status request at all. /silent-renew is
 *   a hidden iframe. /admin is not on this list: it shows the saved live
 *   announcement, so its tab must poll like any other page.
 */
export const MAINTENANCE_BYPASS_PREFIXES = ['/admin', '/silent-renew'] as const
export const STATUS_POLL_EXEMPT_PREFIXES = ['/silent-renew'] as const

function startsWithAnyPrefix(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix))
}

export function isMaintenanceBypassRoute(pathname: string): boolean {
  return startsWithAnyPrefix(pathname, MAINTENANCE_BYPASS_PREFIXES)
}

export function isStatusPollExempt(pathname: string): boolean {
  return startsWithAnyPrefix(pathname, STATUS_POLL_EXEMPT_PREFIXES)
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
