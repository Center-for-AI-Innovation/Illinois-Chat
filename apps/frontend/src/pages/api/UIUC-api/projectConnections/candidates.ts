// GET /api/UIUC-api/projectConnections/candidates?q=
// Projects that exist but have no external-connections row, for the admin
// "Add connection" picker. Returns names only.

import type { NextApiResponse } from 'next'
import { z } from 'zod'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { withSuperAdminOnly } from '~/utils/superAdminGuard'
import { searchProjectsWithoutConnection } from '~/db/projectConnectionsRepo'
import { formatZodError } from '~/utils/projectConnections/handlerShared'

const CANDIDATE_LIMIT = 20

const querySchema = z.object({
  q: z.string().trim().max(100).default(''),
})

// Exported for unit tests — see projectConnections.ts for the same pattern.
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const parsed = querySchema.safeParse({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
  })
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }

  try {
    const projects = await searchProjectsWithoutConnection(
      parsed.data.q,
      CANDIDATE_LIMIT,
    )
    return res.status(200).json({ projects, limit: CANDIDATE_LIMIT })
  } catch (e) {
    console.error('[projectConnections/candidates] failed:', e)
    return res.status(500).json({ error: 'Failed to search projects' })
  }
}

export default withSuperAdminOnly(handler)
