import { eq } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { db } from '~/db/dbClient'
import { projects } from '~/db/schema'
import { type SimConfigField, type SimProjectConfig } from '~/types/sim'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { encryptProjectConfig } from '~/utils/crypto'
import {
  discoverWithCredentials,
  invalidateSimConfigCache,
  resolveSimCredentials,
  simConfigErrorResponse,
  validateSimBaseUrl,
} from '~/utils/simConfig'
import {
  type SimDiscoveryResult,
  simUpstreamErrorResponse,
} from '~/utils/simDiscovery'

type SimProjectUpdate = Partial<
  Pick<
    typeof projects.$inferInsert,
    'sim_api_key' | 'sim_base_url' | 'sim_workspace_id'
  >
>

interface ConfigRejection {
  status: number
  error: string
  // The inputs to mark invalid; none when the cause is not one of them.
  fields?: SimConfigField[]
}

// Covers the listing and every detail call, so a slow Sim cannot hold the
// save open indefinitely.
const DISCOVERY_TIMEOUT_MS = 30_000

/** Map Sim's refusal of the workflow listing to the inputs that cause it. */
function rejectionFromSim(status: number): ConfigRejection {
  switch (status) {
    case 401:
      return {
        status: 400,
        error: 'Sim rejected this API key',
        fields: ['sim_api_key'],
      }
    case 403:
      // A valid key for a workspace it cannot access: either one may be the
      // mistake, so both are flagged.
      return {
        status: 400,
        error:
          "This API key can't access that workspace. Check the API key and the workspace ID.",
        fields: ['sim_api_key', 'sim_workspace_id'],
      }
    case 404:
      return {
        status: 400,
        error: "Sim couldn't find that workspace",
        fields: ['sim_workspace_id'],
      }
    default: {
      const mapped = simUpstreamErrorResponse(status)
      return { status: mapped.status, error: mapped.error }
    }
  }
}

/**
 * Discover the workspace's workflows with the configuration about to be
 * saved. A successful discovery proves the key, workspace and host work
 * together, and its result is the project's new tool list.
 */
async function discoverWithConfig(config: {
  apiKey: string
  workspaceId: string | null
  baseUrl: string | null
}): Promise<
  ({ ok: true } & SimDiscoveryResult) | ({ ok: false } & ConfigRejection)
> {
  const result = await discoverWithCredentials(
    {
      api_key: config.apiKey,
      workspace_id: config.workspaceId,
      base_url: config.baseUrl,
    },
    AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  )
  if (result.ok) return result

  switch (result.reason) {
    case 'missing_workspace_id':
      return {
        ok: false,
        status: 400,
        error: 'Enter the workspace ID this API key belongs to',
        fields: ['sim_workspace_id'],
      }
    case 'invalid_base_url':
      return {
        ok: false,
        status: 400,
        error: 'Invalid Sim base URL — not an allowed Sim host',
        fields: ['sim_base_url'],
      }
    case 'list_failed':
      return { ok: false, ...rejectionFromSim(result.status) }
    case 'timeout':
      return {
        ok: false,
        status: 504,
        error: `Sim did not respond within ${DISCOVERY_TIMEOUT_MS / 1000} seconds`,
      }
    case 'request_failed':
      console.error('[upsertSimConfig] Sim request failed', result.error)
      return {
        ok: false,
        status: 502,
        error: `The request to Sim at ${result.simBaseUrl} failed`,
        fields: config.baseUrl ? ['sim_base_url'] : undefined,
      }
  }
}

/**
 * POST /api/UIUC-api/tools/upsertSimConfig
 *
 * Only the fields present in the body are written. Defaulting the absent ones
 * to NULL made saving credentials wipe `sim_base_url` — the sole way to point a
 * project at a self-hosted Sim — because the form never sends that field.
 * Sending an explicit `null` still clears a value.
 *
 * The API key is stored as the same encrypted envelope external connections
 * use (`ENCRYPTION_MASTER_KEY`); the plaintext never reaches the database.
 *
 * Nothing is written until Sim accepts the configuration: a key is saved only
 * once its workflows have been discovered with it, and that discovery is
 * returned so the caller can show the new tool list without asking again.
 * An error caused by particular inputs lists them in `fields`, so the form can
 * mark them.
 */
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const courseName = req.courseName
  if (!courseName) {
    return res.status(400).json({ error: 'course_name is required' })
  }

  const body = req.body as Partial<SimProjectConfig>
  const update: SimProjectUpdate = {}
  // The key as submitted, trimmed: one pasted with a trailing newline is the
  // same key, and Sim would reject it as typed.
  let submittedKey: string | null = null
  if ('sim_api_key' in body) {
    const raw = body.sim_api_key ?? null
    if (raw !== null && typeof raw !== 'string') {
      return res.status(400).json({
        error: 'sim_api_key must be a string',
        fields: ['sim_api_key'],
      })
    }
    submittedKey = raw?.trim() || null
    if (submittedKey) {
      try {
        update.sim_api_key = await encryptProjectConfig(submittedKey)
      } catch (error) {
        console.error('[upsertSimConfig] failed to encrypt Sim API key', error)
        return res.status(503).json({
          error:
            'Server is missing ENCRYPTION_MASTER_KEY; cannot store the Sim API key',
        })
      }
    } else {
      update.sim_api_key = null
    }
  }
  if ('sim_base_url' in body) {
    const baseUrl =
      typeof body.sim_base_url === 'string' ? body.sim_base_url.trim() : null
    // Reject a base URL the resolver would refuse anyway — a value that only
    // ever fails at discovery time reads as a broken key, not a broken URL.
    if (baseUrl && !validateSimBaseUrl(baseUrl.replace(/\/$/, ''))) {
      return res.status(400).json({
        error: 'Invalid Sim base URL — not an allowed Sim host',
        fields: ['sim_base_url'],
      })
    }
    update.sim_base_url = baseUrl || null
  }
  if ('sim_workspace_id' in body) {
    update.sim_workspace_id = body.sim_workspace_id ?? null
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No Sim configuration fields given' })
  }

  // The configuration this save would leave in place: the body's values, and
  // the stored ones for any field it omits (the form omits a blank key).
  let stored: {
    api_key: string | null
    workspace_id: string | null
    base_url: string | null
  } = { api_key: null, workspace_id: null, base_url: null }
  if (
    !(
      'sim_api_key' in body &&
      'sim_workspace_id' in body &&
      'sim_base_url' in body
    )
  ) {
    const resolved = await resolveSimCredentials(courseName)
    if (resolved.ok) {
      stored = resolved.creds
    } else if (resolved.reason !== 'not_configured') {
      const { status, error } = simConfigErrorResponse(resolved.reason)
      return res.status(status).json({
        error,
        fields:
          resolved.reason === 'decrypt_failed' && !('sim_api_key' in body)
            ? ['sim_api_key']
            : undefined,
      })
    }
  }
  const apiKey = 'sim_api_key' in body ? submittedKey : stored.api_key
  const workspaceId =
    'sim_workspace_id' in body
      ? (update.sim_workspace_id ?? null)
      : stored.workspace_id
  const baseUrl =
    'sim_base_url' in body ? (update.sim_base_url ?? null) : stored.base_url

  // Without a key there is nothing to try — the project is being cleared or
  // has not been set up — so the save goes ahead with no workflows.
  let discovered: SimDiscoveryResult = { workflows: [], failed: [] }
  if (apiKey) {
    const result = await discoverWithConfig({ apiKey, workspaceId, baseUrl })
    if (!result.ok) {
      return res
        .status(result.status)
        .json({ error: result.error, fields: result.fields })
    }
    discovered = { workflows: result.workflows, failed: result.failed }
  }

  const updated = await db
    .update(projects)
    .set(update)
    .where(eq(projects.course_name, courseName))
    .returning({ course_name: projects.course_name })

  // A bare UPDATE against a missing row affects nothing and used to report
  // success, so the caller was told a save happened that never did.
  if (updated.length === 0) {
    return res.status(404).json({ error: 'Project not found' })
  }

  invalidateSimConfigCache(courseName)

  return res.status(200).json({ success: true, ...discovered })
}

export default withCourseOwnerOrAdminAccess()(handler)
