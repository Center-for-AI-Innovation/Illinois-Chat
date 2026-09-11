// Manage the Redis-backed super-admin grants. Super-admin only.
//
// Env-listed admins (SUPER_ADMIN_EMAILS / NEXT_PUBLIC_SUPER_ADMIN_EMAILS) are
// returned for display but are not editable here — they are the recovery floor
// that keeps a Redis outage or a wiped key from locking everyone out, so the
// API must not pretend it can change them.

import type { NextApiResponse } from 'next'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import {
  addSuperAdminBodySchema,
  removeSuperAdminQuerySchema,
} from '~/utils/platformSettings.schema'
import { formatZodError } from '~/utils/projectConnections/handlerShared'
import { withSuperAdminOnly } from '~/utils/superAdminGuard'
import { isSuperAdmin } from '~/utils/superAdmins'
import {
  addSuperAdminGrant,
  readSuperAdminRoster,
  removeSuperAdminGrant,
} from '~/utils/superAdmins.server'

// Exported for unit tests so they can call the handler with a pre-set
// req.user, bypassing the JWT layer.
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(res)
      case 'POST':
        return await handlePost(req, res)
      case 'DELETE':
        return await handleDelete(req, res)
      default:
        res.setHeader('Allow', 'GET, POST, DELETE')
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (err) {
    console.error('[admin/superAdmins] handler error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function handleGet(res: NextApiResponse) {
  return res.status(200).json(await readSuperAdminRoster())
}

async function handlePost(req: AuthenticatedRequest, res: NextApiResponse) {
  const parsed = addSuperAdminBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }
  const { email } = parsed.data

  if (isSuperAdmin(email)) {
    return res.status(409).json({
      error: `${email} is already a super admin via the environment allowlist.`,
    })
  }

  try {
    await addSuperAdminGrant(email)
  } catch (err) {
    console.error('[admin/superAdmins] grant failed:', err)
    return res
      .status(503)
      .json({
        error: 'Could not add the grant. The settings store is unreachable.',
      })
  }

  console.log(
    `[admin/superAdmins] ${
      req.user?.email ?? 'unknown'
    } granted super-admin to ${email}`,
  )
  return res.status(200).json(await readSuperAdminRoster())
}

async function handleDelete(req: AuthenticatedRequest, res: NextApiResponse) {
  const rawEmail = req.query.email
  const parsed = removeSuperAdminQuerySchema.safeParse({
    email: typeof rawEmail === 'string' ? rawEmail : undefined,
  })
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }
  const { email } = parsed.data

  if (isSuperAdmin(email)) {
    return res.status(400).json({
      error: `${email} is granted by the environment allowlist and cannot be removed here. Update SUPER_ADMIN_EMAILS and redeploy.`,
    })
  }

  const roster = await readSuperAdminRoster()
  if (roster.warning) {
    return res.status(503).json({
      error:
        'Could not verify the current roster, so the removal was not applied. Try again once the settings store is reachable.',
    })
  }
  // Refuse the removal that leaves nobody able to reach this page. With an
  // empty env allowlist the Redis grants are the only way in, so dropping the
  // last one is unrecoverable without hand-editing Redis.
  if (
    roster.envAdmins.length === 0 &&
    roster.grantedAdmins.length === 1 &&
    roster.grantedAdmins[0] === email
  ) {
    return res.status(400).json({
      error:
        'Cannot remove the last super admin. Add another admin first, or set SUPER_ADMIN_EMAILS.',
    })
  }

  try {
    await removeSuperAdminGrant(email)
  } catch (err) {
    console.error('[admin/superAdmins] revoke failed:', err)
    return res.status(503).json({
      error: 'Could not remove the grant. The settings store is unreachable.',
    })
  }

  console.log(
    `[admin/superAdmins] ${
      req.user?.email ?? 'unknown'
    } revoked super-admin from ${email}`,
  )
  return res.status(200).json(await readSuperAdminRoster())
}

export default withSuperAdminOnly(handler)
