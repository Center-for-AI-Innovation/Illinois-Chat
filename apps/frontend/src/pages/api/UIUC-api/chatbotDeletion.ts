// Delete a chatbot.
//
// POST { course_name, confirm_name, include_external } starts a deletion: the
// chatbot is hidden immediately and its data is purged in the background
// (see ~/server/chatbotDeletion). Returns 202.
//
// GET ?course_name= returns what the delete dialog needs (which external
// stores are configured) and the latest deletion's status.
//
// Only the owner or a super admin may delete; course admins may not.

import type { NextApiResponse } from 'next'
import { getCourseMetadata, isCourseOwner } from '~/server/authorization'
import {
  ChatbotDeletionConflictError,
  getExternalStores,
  getLatestDeletion,
  startChatbotDeletion,
  type ChatbotDeletion,
} from '~/server/chatbotDeletion'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { isSuperAdmin } from '~/utils/superAdmins'

function toPublic(d: ChatbotDeletion | null) {
  if (!d) return null
  // metadata_backup stays server side.
  return {
    id: d.id,
    project_name: d.project_name,
    status: d.status,
    include_external: d.include_external,
    progress: d.progress,
    error: d.error,
    created_at: d.created_at,
    completed_at: d.completed_at,
  }
}

function firstString(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.trim() ? s.trim() : undefined
}

async function handleGet(req: AuthenticatedRequest, res: NextApiResponse) {
  const courseName = firstString(req.query.course_name)
  if (!courseName) {
    return res.status(400).json({ error: 'course_name is required' })
  }
  const email = req.user!.email
  const superAdmin = isSuperAdmin(email)
  const metadata = await getCourseMetadata(courseName)

  if (metadata) {
    if (!superAdmin && !isCourseOwner(req.user!, metadata)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    return res.status(200).json({
      external_stores: await getExternalStores(courseName),
      deletion: toPublic(await getLatestDeletion(courseName)),
    })
  }

  // Metadata is gone once a deletion starts; fall back to the deletion row.
  const deletion = await getLatestDeletion(courseName)
  if (!deletion || (!superAdmin && deletion.requested_by !== email)) {
    return res.status(404).json({ error: 'Project not found' })
  }
  return res
    .status(200)
    .json({ external_stores: [], deletion: toPublic(deletion) })
}

async function handlePost(req: AuthenticatedRequest, res: NextApiResponse) {
  const courseName = firstString(req.body?.course_name)
  const confirmName = firstString(req.body?.confirm_name)
  const includeExternal = req.body?.include_external === true
  if (!courseName) {
    return res.status(400).json({ error: 'course_name is required' })
  }

  const metadata = await getCourseMetadata(courseName)
  if (!metadata) {
    return res.status(404).json({
      error: 'Project not found',
      message: `Project '${courseName}' does not exist`,
    })
  }

  const email = req.user!.email
  const superAdmin = isSuperAdmin(email)
  if (!superAdmin && !isCourseOwner(req.user!, metadata)) {
    return res.status(403).json({
      error: 'Insufficient permissions',
      message: 'Only the chatbot owner can delete it',
    })
  }
  if (!superAdmin && metadata.is_frozen === true) {
    return res.status(403).json({
      error: 'Project is temporarily frozen by the administrator',
    })
  }
  if (confirmName !== courseName) {
    return res.status(400).json({
      error: 'Confirmation mismatch',
      message: 'Type the chatbot name exactly to confirm deletion',
    })
  }

  try {
    const { deletion, queued } = await startChatbotDeletion({
      courseName,
      metadata,
      requestedBy: email!,
      includeExternal,
    })
    return res.status(202).json({ deletion: toPublic(deletion), queued })
  } catch (err) {
    if (err instanceof ChatbotDeletionConflictError) {
      return res.status(409).json({ error: err.message })
    }
    console.error(`Failed to start deletion of ${courseName}:`, err)
    return res.status(500).json({ error: 'Failed to delete chatbot' })
  }
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (!req.user?.email) {
    return res.status(401).json({ error: 'User not authenticated' })
  }
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

export default withAuth(handler)
