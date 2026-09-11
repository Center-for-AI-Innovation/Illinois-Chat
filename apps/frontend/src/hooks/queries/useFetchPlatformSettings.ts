import { useQuery } from '@tanstack/react-query'
import type { PlatformSettings } from '~/utils/platformSettings.schema'

interface UseFetchPlatformSettingsOptions {
  enabled?: boolean
}

export const PLATFORM_SETTINGS_QUERY_KEY = ['platformSettings'] as const

export interface PlatformSettingsResponse {
  settings: PlatformSettings
  /**
   * Why the stored banner did not load, when it did not. `absent` and
   * `invalid` both hand the admin an empty form, so the UI needs this to say
   * which — an empty form for `invalid` would look like saved state.
   */
  bannerState: 'configured' | 'absent' | 'invalid' | 'unavailable'
  warning?: string
  updatedAt?: string
  updatedBy?: string
}

export async function fetchPlatformSettings(): Promise<PlatformSettingsResponse> {
  const response = await fetch('/api/admin/settings')

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      body?.error ?? `Error fetching platform settings: ${response.status}`,
    )
  }

  return (await response.json()) as PlatformSettingsResponse
}

export function useFetchPlatformSettings({
  enabled = true,
}: UseFetchPlatformSettingsOptions = {}) {
  return useQuery({
    queryKey: PLATFORM_SETTINGS_QUERY_KEY,
    queryFn: fetchPlatformSettings,
    enabled,
    retry: 1,
    // No staleTime: an admin opening this page wants the live value, and a
    // stale form would silently overwrite whatever another operator just saved.
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
