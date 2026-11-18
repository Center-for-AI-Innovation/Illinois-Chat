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
    // The server's message says whether anything changed, so pass it through.
    throw new Error(
      body?.error ?? `Failed to recover project (${response.status})`,
    )
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
