import { useQuery } from '@tanstack/react-query'

interface UseFetchMaintenanceModeOptions {
  enabled?: boolean
}

interface MaintenanceModeResponse {
  isMaintenanceMode: boolean
}

async function fetchMaintenanceMode(): Promise<boolean> {
  const response = await fetch('/api/UIUC-api/getMaintenanceModeFast')

  if (!response.ok) {
    throw new Error(`Error fetching maintenance mode: ${response.status}`)
  }

  const data: MaintenanceModeResponse = await response.json()
  return data.isMaintenanceMode
}

export function useFetchMaintenanceMode({
  enabled = true,
}: UseFetchMaintenanceModeOptions = {}) {
  return useQuery({
    queryKey: ['maintenanceMode'],
    queryFn: fetchMaintenanceMode,
    retry: 1,
    enabled,
    staleTime: 30 * 1000,
    // The gate stays mounted for the whole session, so without polling other
    // users would only see a toggle after a full reload.
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  })
}
