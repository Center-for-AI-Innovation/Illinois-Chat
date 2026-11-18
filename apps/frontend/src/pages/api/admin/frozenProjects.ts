// Frozen-project recovery. Super-admin only.
//
// GET  — every frozen project, minimal fields, from Redis.
// POST — clear `is_frozen` on one project. Nothing else about it changes.
//
// This is the only route that unfreezes a project. Ordinary metadata routes
// still refuse frozen projects, and the super-admin bypass does not reach them.

import type { NextApiResponse } from 'next'
import { z } from 'zod'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { CourseMetadataWriteError } from '~/utils/courseMetadataStore'
import {
  extractRequestMeta,
  formatZodError,
} from '~/utils/projectConnections/handlerShared'
import {
  FrozenProjectRecoveryError,
  listFrozenProjects,
  recoverFrozenProject,
} from '~/utils/frozenProjects.server'
import { withSuperAdminOnly } from '~/utils/superAdminGuard'

// Bounds the body. Legacy names are not restricted to the current name
// pattern, so the exact-match lookup in Redis is the real check.
const COURSE_NAME_MAX_LENGTH = 256

export const recoverBodySchema = z.object({
  course_name: z
    .string()
    .min(1)
    .max(COURSE_NAME_MAX_LENGTH)
    .refine((value) => value === value.trim(), {
      message: 'Project name must not start or end with whitespace',
    }),
})

function sendRecoveryError(res: NextApiResponse, err: unknown) {
  if (err instanceof CourseMetadataWriteError) {
    if (err.stage === 'conflict') {
      return res.status(409).json({
        error:
          'The project changed while it was being recovered. Reload the list and try again.',
      })
    }
    if (err.stage === 'rollback') {
      console.error('[admin/frozenProjects] rollback failed:', err)
      return res.status(500).json({
        error:
          'The recovery could not be completed, and Postgres could not be reconciled to Redis. Reconcile this project by hand before retrying.',
      })
    }
    // 'postgres' and 'redis' both leave the stored state unchanged.
    console.error('[admin/frozenProjects] write failed:', err)
    return res.status(503).json({
      error:
        'Could not save the recovery. Nothing was changed; try again once the stores are reachable.',
    })
  }

  if (err instanceof FrozenProjectRecoveryError) {
    switch (err.code) {
      case 'audit_unavailable':
        return res.status(503).json({
          error:
            'Could not record the recovery in the audit log, so the project was not changed.',
        })
      case 'unreadable_metadata':
        return res.status(422).json({
          error:
            'The stored metadata for this project could not be read, so it was not changed.',
        })
      case 'audit_not_finalized':
        return res.status(500).json({
          recovered: true,
          error:
            'The project was unfrozen, but its audit entry could not be finalized. Check the audit log before retrying.',
        })
    }
  }

  throw err
}

// Exported for unit tests so they can call the handler with a pre-set
// req.user, bypassing the JWT layer.
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    switch (req.method) {
      case 'GET': {
        const projects = await listFrozenProjects()
        return res.status(200).json({ projects })
      }
      case 'POST':
        return await handleRecover(req, res)
      default:
        res.setHeader('Allow', 'GET, POST')
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (err) {
    console.error('[admin/frozenProjects] handler error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function handleRecover(req: AuthenticatedRequest, res: NextApiResponse) {
  const parsed = recoverBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }
  const { course_name: courseName } = parsed.data

  const actorEmail = req.user?.email
  if (!actorEmail) {
    return res.status(401).json({ error: 'User not authenticated' })
  }

  try {
    const outcome = await recoverFrozenProject({
      courseName,
      actorEmail,
      meta: extractRequestMeta(req),
    })

    if (outcome.status === 'not_found') {
      return res.status(404).json({
        error: `Project '${courseName}' does not exist.`,
      })
    }
    if (outcome.status === 'not_frozen') {
      return res.status(409).json({
        error: `Project '${courseName}' is not frozen.`,
      })
    }

    console.log(
      `[admin/frozenProjects] ${actorEmail} unfroze ${courseName} (audit ${outcome.auditId})`,
    )
    return res.status(200).json({
      recovered: true,
      course_name: courseName,
    })
  } catch (err) {
    return sendRecoveryError(res, err)
  }
}

const guardedHandler = withSuperAdminOnly(handler)

// Set before the guard so 401 and 403 responses are covered too. These bodies
// describe per-user admin state, and a shared cache must never store them.
export default async function frozenProjectsRoute(
  req: AuthenticatedRequest,
  res: NextApiResponse,
) {
  res.setHeader('Cache-Control', 'private, no-store')
  return guardedHandler(req, res)
}
