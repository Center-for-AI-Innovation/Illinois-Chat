import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SUPER_ADMINS_QUERY_KEY,
  type SuperAdminRosterResponse,
} from './useFetchSuperAdmins'

export type UpdateSuperAdminVariables =
  | { action: 'add'; email: string }
  | { action: 'remove'; email: string }

/**
 * Both endpoints return the freshly-read roster, so the mutation result is
 * written straight into the query cache instead of triggering a refetch.
 */
export async function updateSuperAdmins(
  variables: UpdateSuperAdminVariables,
): Promise<SuperAdminRosterResponse> {
  const response =
    variables.action === 'add'
      ? await fetch('/api/admin/superAdmins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: variables.email }),
        })
      : await fetch(
          `/api/admin/superAdmins?email=${encodeURIComponent(variables.email)}`,
          { method: 'DELETE' },
        )

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    // The server has real reasons to refuse — the address is env-granted, or
    // it is the last admin standing — and those messages are worth surfacing
    // verbatim rather than replaced with a generic failure.
    throw new Error(
      body?.error ??
        `Failed to ${variables.action} super admin (${response.status})`,
    )
  }

  return body as SuperAdminRosterResponse
}

export function useUpdateSuperAdmins() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateSuperAdmins,
    onSuccess: (roster) => {
      queryClient.setQueryData(SUPER_ADMINS_QUERY_KEY, roster)
      // A super admin can revoke their own grant, which changes what the nav
      // and this very page are allowed to show.
      void queryClient.invalidateQueries({ queryKey: ['isSuperAdmin'] })
    },
  })
}
