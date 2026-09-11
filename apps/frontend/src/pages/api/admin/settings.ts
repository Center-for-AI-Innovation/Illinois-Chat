// Read and write runtime platform settings (announcement banner, maintenance
// mode). Super-admin only via withSuperAdminOnly — the guard runs inside the
// handler, not in Next middleware (see CVE-2025-29927).

import type { NextApiResponse } from 'next'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { platformSettingsSchema } from '~/utils/platformSettings.schema'
import {
  readPlatformSettings,
  writePlatformSettings,
} from '~/utils/platformSettings.server'
import { formatZodError } from '~/utils/projectConnections/handlerShared'
import { withSuperAdminOnly } from '~/utils/superAdminGuard'

// Exported for unit tests so they can call the handler with a pre-set
// req.user, bypassing the JWT layer.
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(res)
      case 'PUT':
        return await handlePut(req, res)
      default:
        res.setHeader('Allow', 'GET, PUT')
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (err) {
    console.error('[admin/settings] handler error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function handleGet(res: NextApiResponse) {
  const snapshot = await readPlatformSettings()
  return res.status(200).json(snapshot)
}

async function handlePut(req: AuthenticatedRequest, res: NextApiResponse) {
  const parsed = platformSettingsSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }

  const actorEmail = req.user?.email ?? 'unknown'

  let updatedAt: string
  try {
    ;({ updatedAt } = await writePlatformSettings(parsed.data, actorEmail))
  } catch (err) {
    console.error('[admin/settings] write failed:', err)
    return res.status(503).json({
      saved: false,
      error: 'Could not write settings. The settings store is unreachable.',
    })
  }

  // The home page is statically generated with `revalidate: 30`, so a banner
  // change lands within 30s on its own. This kicks the current replica so the
  // admin usually sees it immediately.
  //
  // Reported separately from `saved` on purpose: on-demand revalidation only
  // regenerates the replica that served this request, and it can fail on its
  // own (e.g. the page throws during regeneration) without the settings write
  // being any less durable. Collapsing the two would surface a durable save as
  // a failure and prompt the admin to retry a write that already succeeded.
  let revalidated = false
  let revalidationError: string | undefined
  try {
    await res.revalidate('/')
    revalidated = true
  } catch (err) {
    revalidationError = err instanceof Error ? err.message : String(err)
    console.warn(
      '[admin/settings] revalidation of / failed:',
      revalidationError,
    )
  }

  return res.status(200).json({
    saved: true,
    revalidated,
    updatedAt,
    updatedBy: actorEmail,
    ...(revalidationError ? { revalidationError } : {}),
  })
}

export default withSuperAdminOnly(handler)
