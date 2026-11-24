import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FROZEN_PROJECTS_QUERY_KEY } from './useFetchFrozenProjects'

// Every list that can show a project. Recovery makes it reappear in all of
// them, so each cached copy is refreshed rather than only the frozen list.
const PROJECT_LISTING_QUERY_KEYS = [
  ['allCourseMetadata'],
  ['allCourseNames'],
  ['pagedChatbots'],
  ['searchChatbots'],
  ['featuredChatbots'],
  ['courseExists'],
  ['courseMetadata'],
] as const

export interface RecoverFrozenProjectResult {
  recovered: true
  course_name: string
}

/**
 * The project was unfrozen, but its audit entry could not be finalized. This is
 * a success with a bookkeeping problem, not a failed recovery, so the UI shows
 * it differently from an ordinary error.
 */
export class FrozenProjectRecoveryPartialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrozenProjectRecoveryPartialError'
  }
}

export async function recoverFrozenProject(
  courseName: string,
): Promise<RecoverFrozenProjectResult> {
  const response = await fetch('/api/admin/frozenProjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_name: courseName }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    // Only the server's explicit flag counts as recovered. Any other 500 is
    // treated as a failure, because nothing in it says the unfreeze landed.
    const message =
      body?.error ?? `Failed to recover project (${response.status})`
    if (response.status === 500 && body?.recovered === true) {
      throw new FrozenProjectRecoveryPartialError(message)
    }
    // The server's message says whether anything changed, so pass it through.
    throw new Error(message)
  }

  return body as RecoverFrozenProjectResult
}

export function useRecoverFrozenProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: recoverFrozenProject,
    // Settled, not success: a 500 after the unfreeze landed still changed state.
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: FROZEN_PROJECTS_QUERY_KEY,
      })
      for (const queryKey of PROJECT_LISTING_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey })
      }
    },
  })
}
