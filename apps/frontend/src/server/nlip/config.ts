import { ensureRedisConnected } from '~/utils/redisClient'
import { getBaseUrl } from '~/utils/apiUtils'
import { encryptProjectConfig, decryptProjectConfig } from '~/utils/crypto'
import {
  nlipConfigInputSchema,
  type NlipAgent,
  type PublicNlipAgent,
} from '~/types/nlip'

type StoredAgent = NlipAgent & { token?: { encrypted: string } }
export interface NlipConfig {
  inboundEnabled: boolean
  agents: StoredAgent[]
}
const HASH = 'project_nlip_configs'

// Redis is already the project's metadata/provider store. Keep credentials
// encrypted with the existing server-only master key; no database migration.
export async function readNlipConfig(project: string): Promise<NlipConfig> {
  const redis = await ensureRedisConnected()
  const raw = await redis.hGet(HASH, project)
  return raw
    ? (JSON.parse(raw) as NlipConfig)
    : { inboundEnabled: false, agents: [] }
}

export function publicNlipConfig(config: NlipConfig): {
  inboundEnabled: boolean
  agents: PublicNlipAgent[]
} {
  return {
    inboundEnabled: config.inboundEnabled,
    agents: config.agents.map(({ token, ...agent }) => ({
      ...agent,
      hasToken: Boolean(token),
    })),
  }
}

export async function saveNlipConfig(
  project: string,
  input: unknown,
): Promise<NlipConfig> {
  const parsed = nlipConfigInputSchema.parse(input)
  const previous = await readNlipConfig(project)
  const agents = await Promise.all(
    parsed.agents.map(async ({ token, ...agent }): Promise<StoredAgent> => {
      const old = previous.agents.find((a) => a.id === agent.id)
      // Moving a credential to another project requires explicit replacement.
      const oldToken = old?.project === agent.project ? old.token : undefined
      const storedToken =
        token === null
          ? undefined
          : token === undefined
            ? oldToken
            : await encryptProjectConfig(token)
      return {
        ...agent,
        ...(storedToken ? { token: storedToken } : {}),
      }
    }),
  )
  const config: NlipConfig = {
    inboundEnabled: parsed.inboundEnabled,
    agents,
  }
  const redis = await ensureRedisConnected()
  await redis.hSet(HASH, project, JSON.stringify(config))
  return config
}

// The only place that decides where an agent's NLIP messages go. Agents are
// currently other projects on this deployment; supporting external NLIP
// servers means adding a destination kind here (with its own egress checks).
// The protocol types and the HTTP client stay as they are.
function nlipEndpoint(agent: NlipAgent): string {
  return `${getBaseUrl()}/api/nlip/${encodeURIComponent(agent.project)}`
}

export async function resolveNlipAgent(project: string, id: string) {
  const config = await readNlipConfig(project)
  const agent = config.agents.find((a) => a.id === id && a.enabled)
  if (!agent) throw new Error('This NLIP agent is not enabled for this project')
  return {
    ...agent,
    endpoint: nlipEndpoint(agent),
    credential: await decryptProjectConfig<string>(agent.token),
  }
}
