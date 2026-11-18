import {
  isCancelledError,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'
import { SITE_STATUS_FRESH_PARAM } from '~/utils/siteStatusCache'

export const SITE_STATUS_QUERY_KEY = ['siteStatus'] as const
const SITE_STATUS_ENDPOINT = '/api/UIUC-api/siteStatus'

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

async function parseSiteStatus(response: Response): Promise<SiteStatus> {
  if (!response.ok) {
    throw new Error(`Error fetching site status: ${response.status}`)
  }

  return (await response.json()) as SiteStatus
}

/** An ordinary poll on the bare URL, so the shared cache may answer it. */
export async function fetchSiteStatus(signal?: AbortSignal): Promise<SiteStatus> {
  return parseSiteStatus(await fetch(SITE_STATUS_ENDPOINT, { signal }))
}

let refreshCount = 0

/**
 * The explicit refresh after a save. The URL carries a nonce no earlier
 * request used, so no cache can match it, and `no-store` keeps the browser
 * from reusing an earlier answer. The nonce is per call, so rapid saves never
 * share a URL.
 */
export async function fetchFreshSiteStatus(
  signal?: AbortSignal,
): Promise<SiteStatus> {
  refreshCount += 1
  const nonce = `${Date.now()}-${refreshCount}`
  const url = `${SITE_STATUS_ENDPOINT}?${SITE_STATUS_FRESH_PARAM}=${nonce}`
  return parseSiteStatus(await fetch(url, { cache: 'no-store', signal }))
}

/**
 * Refresh the shared query after a durable save, bypassing cached GETs.
 * Cancel older fetches so late responses cannot replace the fresh status.
 * Follow-up failure must not fail the save or clear the last-good data.
 */
export async function refreshSiteStatusAfterSave(
  queryClient: QueryClient,
): Promise<void> {
  try {
    await queryClient.cancelQueries({ queryKey: SITE_STATUS_QUERY_KEY })
    // One attempt, no backoff: the save should not wait on a retry. If it
    // fails, the next scheduled poll is the recovery.
    await queryClient.fetchQuery<SiteStatus>({
      queryKey: SITE_STATUS_QUERY_KEY,
      queryFn: ({ signal }) => fetchFreshSiteStatus(signal),
      staleTime: 0,
      retry: false,
    })
  } catch (error) {
    // Superseded by a newer save. The newer refresh owns the data now.
    if (isCancelledError(error)) return
    console.warn('[siteStatus] refresh after settings save failed')
  }
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
    queryFn: ({ signal }) => fetchSiteStatus(signal),
    enabled,
    retry: 1,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: (query) =>
      query.state.data?.isMaintenanceMode === undefined ? 'always' : true,
  })
}
