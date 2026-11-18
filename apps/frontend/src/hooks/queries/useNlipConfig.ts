import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  nlipAgentSchema,
  type PublicNlipAgent,
  type nlipConfigInputSchema,
} from '~/types/nlip'
import { z } from 'zod'

export interface PublicNlipConfig {
  inboundEnabled: boolean
  agents: PublicNlipAgent[]
}
const path = (project: string) =>
  `/api/UIUC-api/tools/nlipAgents?${new URLSearchParams({ course_name: project })}`
const publicConfigSchema = z.object({
  inboundEnabled: z.boolean(),
  agents: z.array(nlipAgentSchema.extend({ hasToken: z.boolean() })),
})
function parseConfig(body: unknown): PublicNlipConfig {
  const parsed = publicConfigSchema.safeParse(body)
  if (!parsed.success) throw new Error('Invalid NLIP configuration response')
  return parsed.data
}
export async function fetchNlipConfig(
  project: string,
): Promise<PublicNlipConfig> {
  const response = await fetch(path(project))
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.error ?? 'Could not load NLIP configuration')
  return parseConfig(body)
}
export async function saveNlipConfig(
  project: string,
  config: z.input<typeof nlipConfigInputSchema>,
): Promise<PublicNlipConfig> {
  const response = await fetch(path(project), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.error ?? 'Could not save NLIP configuration')
  return parseConfig(body)
}
export function useNlipConfig(project: string) {
  return useQuery({
    queryKey: ['nlip-config', project],
    queryFn: () => fetchNlipConfig(project),
    retry: false,
  })
}
export function useSaveNlipConfig(project: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (config: z.input<typeof nlipConfigInputSchema>) =>
      saveNlipConfig(project, config),
    onSuccess: (data) => {
      client.setQueryData(['nlip-config', project], data)
      void client.invalidateQueries({ queryKey: ['tools', project] })
    },
  })
}
