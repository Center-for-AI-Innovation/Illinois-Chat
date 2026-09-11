import { useQuery } from '@tanstack/react-query'
import type { ConnectionKind } from '~/utils/projectConnections/validation'

interface UseFetchProjectConnectionsOptions {
  enabled?: boolean
}

export const PROJECT_CONNECTIONS_QUERY_KEY = ['projectConnections'] as const

export function projectConnectionQueryKey(projectName: string) {
  return ['projectConnection', projectName] as const
}

export interface ProjectConnectionSummary {
  project_name: string
  is_active: boolean
  configured_kinds: ConnectionKind[]
  updated_at: string | null
  created_at: string | null
}

/**
 * One project's configs, with every secret-bearing field masked to its last 4
 * characters. A masked value must never be written back — see
 * `useUpdateProjectConnection`, which patches only the fields the admin
 * actually retyped.
 */
export interface ProjectConnectionDetail {
  found: boolean
  project_name: string
  is_active?: boolean
  created_at?: string | null
  updated_at?: string | null
  s3_config?: Record<string, unknown> | null
  database_config?: Record<string, unknown> | null
  qdrant_config?: Record<string, unknown> | null
  embedding_config?: Record<string, unknown> | null
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  return new Error(body?.error ?? fallback)
}

export async function fetchProjectConnections(): Promise<
  ProjectConnectionSummary[]
> {
  const response = await fetch('/api/UIUC-api/projectConnections/list')
  if (!response.ok) {
    throw await readError(
      response,
      `Error fetching connections: ${response.status}`,
    )
  }
  const data = (await response.json()) as {
    connections: ProjectConnectionSummary[]
  }
  return data.connections
}

export async function fetchProjectConnection(
  projectName: string,
): Promise<ProjectConnectionDetail> {
  const response = await fetch(
    `/api/UIUC-api/projectConnections?project_name=${encodeURIComponent(
      projectName,
    )}`,
  )
  if (!response.ok) {
    throw await readError(
      response,
      `Error fetching connection: ${response.status}`,
    )
  }
  return (await response.json()) as ProjectConnectionDetail
}

export function useFetchProjectConnections({
  enabled = true,
}: UseFetchProjectConnectionsOptions = {}) {
  return useQuery({
    queryKey: PROJECT_CONNECTIONS_QUERY_KEY,
    queryFn: fetchProjectConnections,
    enabled,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function useFetchProjectConnection(
  projectName: string | null,
  { enabled = true }: UseFetchProjectConnectionsOptions = {},
) {
  return useQuery({
    queryKey: projectConnectionQueryKey(projectName ?? ''),
    queryFn: () => fetchProjectConnection(projectName as string),
    enabled: enabled && !!projectName,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
