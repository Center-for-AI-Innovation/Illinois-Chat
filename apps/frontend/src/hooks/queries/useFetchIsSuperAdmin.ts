import { useQuery } from '@tanstack/react-query'

interface UseFetchIsSuperAdminOptions {
  enabled?: boolean
}

export interface IsSuperAdminResponse {
  email: string | null
  isSuperAdmin: boolean
}

/**
 * Asks the server whether the current user is a super admin.
 *
 * A round trip is unavoidable: only the env allowlist is inlined into the
 * client bundle, so a Redis-granted admin is invisible to `isSuperAdmin()` in
 * the browser. Gating UI on the env list alone hides controls from admins the
 * API would happily accept writes from.
 *
 * A 401 is a normal answer, not a failure — this is called from pages that
 * anonymous visitors reach — so unauthenticated resolves to `false` instead of
 * throwing and putting the query into an error state.
 */
export async function fetchIsSuperAdmin(): Promise<boolean> {
  const response = await fetch('/api/admin/me')

  if (response.status === 401 || response.status === 403) return false
  if (!response.ok) {
    throw new Error(`Error fetching super-admin status: ${response.status}`)
  }

  const data: IsSuperAdminResponse = await response.json()
  return data.isSuperAdmin === true
}

export function useFetchIsSuperAdmin({
  enabled = true,
}: UseFetchIsSuperAdminOptions = {}) {
  return useQuery({
    queryKey: ['isSuperAdmin'],
    queryFn: fetchIsSuperAdmin,
    enabled,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
