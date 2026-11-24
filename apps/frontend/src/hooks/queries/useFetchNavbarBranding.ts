import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_NAVBAR_BRANDING,
  type NavbarBranding,
} from '~/utils/platformSettings.schema'

export const NAVBAR_BRANDING_QUERY_KEY = ['navbarBranding'] as const

export async function fetchNavbarBranding(): Promise<NavbarBranding> {
  const response = await fetch('/api/UIUC-api/navbarBranding')

  if (!response.ok) {
    throw new Error(`Error fetching navbar branding: ${response.status}`)
  }

  const data: { branding?: NavbarBranding } = await response.json()
  return data.branding ?? DEFAULT_NAVBAR_BRANDING
}

/**
 * `data` stays undefined until the first fetch lands (unless `_app` seeded the
 * cache from a statically generated page), so the navbar can hold the
 * wordmark's space instead of flashing the default brand on a rebranded site.
 */
export function useFetchNavbarBranding() {
  return useQuery<NavbarBranding>({
    queryKey: NAVBAR_BRANDING_QUERY_KEY,
    queryFn: fetchNavbarBranding,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}
