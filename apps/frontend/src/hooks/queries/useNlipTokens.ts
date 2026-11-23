import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NlipInboundToken } from '~/types/nlip'

const path = (project: string) =>
  `/api/UIUC-api/tools/nlipTokens?${new URLSearchParams({ course_name: project })}`
const key = (project: string) => ['nlip-tokens', project]

async function request<T>(project: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path(project), {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'NLIP token request failed')
  return body as T
}

export async function fetchNlipTokens(
  project: string,
): Promise<NlipInboundToken[]> {
  return (await request<{ tokens: NlipInboundToken[] }>(project)).tokens
}

export function useNlipTokens(project: string) {
  return useQuery({
    queryKey: key(project),
    queryFn: () => fetchNlipTokens(project),
    retry: false,
  })
}

export function useCreateNlipToken(project: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      request<NlipInboundToken & { token: string }>(project, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: key(project) }),
  })
}

export function useRevokeNlipToken(project: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      request(project, { method: 'DELETE', body: JSON.stringify({ id }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: key(project) }),
  })
}
