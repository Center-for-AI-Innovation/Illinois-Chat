import { useQuery } from '@tanstack/react-query'

interface UseFetchFrozenProjectsOptions {
  enabled?: boolean
}

export const FROZEN_PROJECTS_QUERY_KEY = ['frozenProjects'] as const

/** Only what an operator needs to identify a frozen project. */
export interface FrozenProjectSummary {
  course_name: string
  course_owner: string | null
  is_private: boolean
}

export async function fetchFrozenProjects(): Promise<FrozenProjectSummary[]> {
  const response = await fetch('/api/admin/frozenProjects')

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      body?.error ?? `Error fetching frozen projects: ${response.status}`,
    )
  }

  const data = (await response.json()) as { projects: FrozenProjectSummary[] }
  return data.projects
}

export function useFetchFrozenProjects({
  enabled = true,
}: UseFetchFrozenProjectsOptions = {}) {
  return useQuery({
    queryKey: FROZEN_PROJECTS_QUERY_KEY,
    queryFn: fetchFrozenProjects,
    enabled,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
