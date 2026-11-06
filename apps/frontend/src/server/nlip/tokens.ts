import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { ensureRedisConnected } from '~/utils/redisClient'
import type { NlipInboundToken } from '~/types/nlip'

type StoredToken = NlipInboundToken & { hash: string }

// Kept apart from the agent config so saving one never overwrites the other.
// Only a SHA-256 hash is stored; the token itself is shown once on creation.
const HASH = 'project_nlip_inbound_tokens'
export const MAX_NLIP_TOKENS = 20

const digest = (token: string) => createHash('sha256').update(token).digest()

async function readTokens(project: string): Promise<StoredToken[]> {
  const redis = await ensureRedisConnected()
  const raw = await redis.hGet(HASH, project)
  return raw ? (JSON.parse(raw) as StoredToken[]) : []
}

async function writeTokens(project: string, tokens: StoredToken[]) {
  const redis = await ensureRedisConnected()
  await redis.hSet(HASH, project, JSON.stringify(tokens))
}

export async function listInboundTokens(
  project: string,
): Promise<NlipInboundToken[]> {
  return (await readTokens(project)).map(({ hash: _hash, ...meta }) => meta)
}

/** Returns the new token (shown once), or null when the project is full. */
export async function createInboundToken(project: string, name: string) {
  const tokens = await readTokens(project)
  if (tokens.length >= MAX_NLIP_TOKENS) return null
  const token = `nlip_${randomBytes(32).toString('base64url')}`
  const meta: NlipInboundToken = {
    id: randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  }
  await writeTokens(project, [
    ...tokens,
    { ...meta, hash: digest(token).toString('hex') },
  ])
  return { ...meta, token }
}

export async function revokeInboundToken(project: string, id: string) {
  const tokens = await readTokens(project)
  await writeTokens(
    project,
    tokens.filter((t) => t.id !== id),
  )
}

/** Returns the matching token's metadata, or undefined. */
export async function verifyInboundToken(
  project: string,
  token: string,
): Promise<NlipInboundToken | undefined> {
  const presented = digest(token)
  const match = (await readTokens(project)).find((t) =>
    timingSafeEqual(presented, Buffer.from(t.hash, 'hex')),
  )
  return match && { id: match.id, name: match.name, createdAt: match.createdAt }
}
