import { useQuery } from '@tanstack/react-query'

interface UseFetchSuperAdminsOptions {
  enabled?: boolean
}

export const SUPER_ADMINS_QUERY_KEY = ['superAdminRoster'] as const

export interface SuperAdminRosterResponse {
  /** From the env allowlist. Rendered read-only — the UI cannot change these. */
  envAdmins: string[]
  /** From Redis. Editable. */
  grantedAdmins: string[]
  /** Set when the Redis grants could not be read; env admins still listed. */
  warning?: string
}

export async function fetchSuperAdmins(): Promise<SuperAdminRosterResponse> {
  const response = await fetch('/api/admin/superAdmins')

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      body?.error ?? `Error fetching super admins: ${response.status}`,
    )
  }

  return (await response.json()) as SuperAdminRosterResponse
}

export function useFetchSuperAdmins({
  enabled = true,
}: UseFetchSuperAdminsOptions = {}) {
  return useQuery({
    queryKey: SUPER_ADMINS_QUERY_KEY,
    queryFn: fetchSuperAdmins,
    enabled,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
