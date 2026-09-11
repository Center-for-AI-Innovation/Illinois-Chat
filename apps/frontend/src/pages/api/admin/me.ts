// Whether the caller is a super admin.
//
// Exists because client-side gating cannot answer this on its own: only the
// env allowlist is inlined into the bundle (NEXT_PUBLIC_SUPER_ADMIN_EMAILS),
// so a Redis-granted admin is invisible to the browser. Components that used
// the sync `isSuperAdmin()` for gating would hide controls the API accepts.
//
// Authenticated rather than super-admin-only: a non-admin must get a usable
// `false`, not a 403.

import type { NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { isSuperAdminAsync } from '~/utils/superAdmins.server'

export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const email = req.user?.email ?? null
    return res.status(200).json({
      email,
      isSuperAdmin: await isSuperAdminAsync(email),
    })
  } catch (err) {
    console.error('[admin/me] handler error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default withAuth(handler)
