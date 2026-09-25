// GET /api/UIUC-api/projectConnections/list
// Every project with an external-connections row, for the admin table.
//
// Deliberately returns no config contents — not even masked ones. The table
// only needs to know which kinds exist; a config is read one project at a time
// through the detail route, so secrets never travel with a bulk listing.

import type { NextApiResponse } from 'next'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { withSuperAdminOnly } from '~/utils/superAdminGuard'
import { listConnections } from '~/db/projectConnectionsRepo'

// Exported for unit tests — see projectConnections.ts for the same pattern.
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const connections = await listConnections()
    return res.status(200).json({
      connections: connections.map((c) => ({
        project_name: c.project_name,
        // The column is nullable in the schema; older rows predate the default.
        is_active: c.is_active ?? false,
        configured_kinds: c.configured_kinds,
        updated_at: c.updated_at?.toISOString() ?? null,
        created_at: c.created_at?.toISOString() ?? null,
      })),
    })
  } catch (e) {
    console.error('[projectConnections/list] failed:', e)
    return res.status(500).json({ error: 'Failed to list connections' })
  }
}

export default withSuperAdminOnly(handler)
