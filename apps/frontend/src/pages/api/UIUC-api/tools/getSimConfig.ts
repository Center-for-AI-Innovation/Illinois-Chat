import { eq } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { db } from '~/db/dbClient'
import { projects } from '~/db/schema'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import {
  getToolRouterStatus,
  type ToolRouterStatus,
} from '~/utils/server/toolRouting'
import { resolveStoredSimApiKey } from '~/utils/simConfig'

/**
 * What this route tells the browser about a project's Sim configuration. The
 * API key itself never leaves the server — masking client-side after
 * transmitting the real value would leave it in the response, the React state,
 * and the DOM. The form treats a blank key input as "unchanged", so the real
 * value is never needed for display.
 */
export interface SimConfigResponse {
  has_api_key: boolean
  sim_api_key_masked: string | null
  // Set when a key is stored but cannot be read (rotated ENCRYPTION_MASTER_KEY
  // or unapplied migration); the form shows it so the admin re-enters the key.
  sim_api_key_error?: string
  sim_base_url: string | null
  sim_workspace_id: string | null
  // Project-level tool-routing status for the badge on the tools page.
  // Carries no credentials or endpoints.
  tool_routing: ToolRouterStatus
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '*'.repeat(key.length)
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
}

const EMPTY_CONFIG = {
  has_api_key: false,
  sim_api_key_masked: null,
  sim_base_url: null,
  sim_workspace_id: null,
}

/**
 * GET /api/UIUC-api/tools/getSimConfig?course_name=X
 */
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const courseName = req.courseName
  if (!courseName) {
    return res.status(400).json({ error: 'course_name is required' })
  }

  const rows = await db
    .select({
      sim_api_key: projects.sim_api_key,
      sim_base_url: projects.sim_base_url,
      sim_workspace_id: projects.sim_workspace_id,
    })
    .from(projects)
    .where(eq(projects.course_name, courseName))
    .limit(1)

  const row = rows[0]

  // A status failure must not break the whole config fetch.
  let tool_routing: ToolRouterStatus
  try {
    tool_routing = await getToolRouterStatus(courseName)
  } catch (error) {
    console.error('Failed to compute tool-routing status:', error)
    tool_routing = {
      status: 'offline',
      reason: 'Could not determine tool-routing status.',
    }
  }

  let keyFields: Pick<
    SimConfigResponse,
    'has_api_key' | 'sim_api_key_masked' | 'sim_api_key_error'
  > = { has_api_key: false, sim_api_key_masked: null }
  if (row) {
    try {
      const key = await resolveStoredSimApiKey(courseName, row.sim_api_key)
      keyFields = {
        has_api_key: Boolean(key),
        sim_api_key_masked: key ? maskKey(key) : null,
      }
    } catch (error) {
      console.error('[getSimConfig] could not read stored Sim API key', error)
      keyFields = {
        has_api_key: true,
        sim_api_key_masked: null,
        sim_api_key_error:
          'The stored Sim API key could not be read. Enter it again to restore tools.',
      }
    }
  }

  const config: SimConfigResponse = {
    ...(row
      ? {
          ...keyFields,
          sim_base_url: row.sim_base_url,
          sim_workspace_id: row.sim_workspace_id,
        }
      : EMPTY_CONFIG),
    tool_routing,
  }

  return res.status(200).json(config)
}

export default withCourseOwnerOrAdminAccess()(handler)
