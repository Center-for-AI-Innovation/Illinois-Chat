import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PlatformSettings } from '~/utils/platformSettings.schema'
import { ANNOUNCEMENT_BANNER_QUERY_KEY } from './useFetchAnnouncementBanner'
import { PLATFORM_SETTINGS_QUERY_KEY } from './useFetchPlatformSettings'

export interface UpdatePlatformSettingsResponse {
  saved: true
  /**
   * Whether the home page was regenerated on the spot. Reported separately
   * from `saved` because on-demand revalidation only reaches the replica that
   * served this request and can fail on its own — the save is durable either
   * way, and the banner still lands within the ISR window. Callers must not
   * present `revalidated: false` as a failed save.
   */
  revalidated: boolean
  updatedAt: string
  updatedBy: string
  revalidationError?: string
}

export async function updatePlatformSettings(
  settings: PlatformSettings,
): Promise<UpdatePlatformSettingsResponse> {
  const response = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      body?.error ?? `Failed to save settings (${response.status})`,
    )
  }

  return body as UpdatePlatformSettingsResponse
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updatePlatformSettings,
    onSuccess: () => {
      // Maintenance lives behind its own two endpoints that the app-wide gate
      // reads, so those caches have to be dropped too or the operator who just
      // enabled maintenance keeps browsing as if it were off.
      void queryClient.invalidateQueries({
        queryKey: PLATFORM_SETTINGS_QUERY_KEY,
      })
      void queryClient.invalidateQueries({ queryKey: ['maintenanceMode'] })
      void queryClient.invalidateQueries({ queryKey: ['maintenanceDetails'] })
      void queryClient.invalidateQueries({
        queryKey: ANNOUNCEMENT_BANNER_QUERY_KEY,
      })
    },
  })
}
