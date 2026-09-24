import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ConnectionKind } from '~/utils/projectConnections/validation'
import {
  CONNECTION_CANDIDATES_QUERY_KEY,
  PROJECT_CONNECTIONS_QUERY_KEY,
  projectConnectionQueryKey,
} from './useFetchProjectConnections'

/**
 * The four write shapes the connections editor needs.
 *
 * `upsert` and `patch` are deliberately separate rather than one "save":
 * POST hardcodes `is_active: true`, so routing a toggle change through it
 * would silently reactivate a connection an operator had disabled. `patch`
 * merges server-side against the stored config, which is also what lets the
 * UI hold masked secrets — omitted fields keep their real values.
 */
export type UpdateProjectConnectionVariables =
  | {
      action: 'upsert'
      projectName: string
      kind: ConnectionKind
      config: Record<string, unknown>
    }
  | {
      action: 'patch'
      projectName: string
      kind: ConnectionKind
      config: Record<string, unknown>
    }
  | { action: 'setActive'; projectName: string; isActive: boolean }
  | { action: 'clear'; projectName: string; kind?: ConnectionKind }

export interface UpdateProjectConnectionResponse {
  success?: boolean
  project_name?: string
  kind?: ConnectionKind | null
  is_active?: boolean
  warning?: string
  deleted?: boolean
  cleared?: ConnectionKind | null
}

async function request(
  url: string,
  init: RequestInit,
): Promise<UpdateProjectConnectionResponse> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  return body as UpdateProjectConnectionResponse
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export async function updateProjectConnection(
  variables: UpdateProjectConnectionVariables,
): Promise<UpdateProjectConnectionResponse> {
  switch (variables.action) {
    case 'upsert':
      return request('/api/UIUC-api/projectConnections', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_name: variables.projectName,
          kind: variables.kind,
          config: variables.config,
        }),
      })
    case 'patch':
      return request('/api/UIUC-api/projectConnections', {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_name: variables.projectName,
          kind: variables.kind,
          config: variables.config,
        }),
      })
    case 'setActive':
      return request('/api/UIUC-api/projectConnections/active', {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({
          project_name: variables.projectName,
          is_active: variables.isActive,
        }),
      })
    case 'clear': {
      const params = new URLSearchParams({
        project_name: variables.projectName,
      })
      if (variables.kind) params.set('kind', variables.kind)
      return request(`/api/UIUC-api/projectConnections?${params.toString()}`, {
        method: 'DELETE',
      })
    }
    default: {
      const exhaustive: never = variables
      throw new Error(`Unhandled action: ${JSON.stringify(exhaustive)}`)
    }
  }
}

export function useUpdateProjectConnection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateProjectConnection,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: projectConnectionQueryKey(variables.projectName),
      })
      void queryClient.invalidateQueries({
        queryKey: PROJECT_CONNECTIONS_QUERY_KEY,
      })
      void queryClient.invalidateQueries({
        queryKey: CONNECTION_CANDIDATES_QUERY_KEY,
      })
    },
  })
}
