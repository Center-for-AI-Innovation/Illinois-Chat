// Re-queue a chatbot deletion that failed or never got queued.
// Super admin only. The worker resumes from the last finished step.

import type { NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { db, projectDeletions } from '~/db/dbClient'
import { enqueueChatbotDeletion } from '~/server/chatbotDeletion'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { withSuperAdminOnly } from '~/utils/superAdminGuard'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const deletionId = Number(req.body?.deletion_id)
  if (!Number.isInteger(deletionId) || deletionId <= 0) {
    return res.status(400).json({ error: 'deletion_id is required' })
  }

  const [deletion] = await db
    .select({ status: projectDeletions.status })
    .from(projectDeletions)
    .where(eq(projectDeletions.id, deletionId))
    .limit(1)
  if (!deletion) {
    return res.status(404).json({ error: 'Deletion not found' })
  }
  if (deletion.status === 'completed') {
    return res.status(409).json({ error: 'Deletion already completed' })
  }

  try {
    await enqueueChatbotDeletion(deletionId)
  } catch (err) {
    console.error(`Retry of deletion ${deletionId} could not be queued:`, err)
    return res.status(503).json({ error: 'Could not queue deletion' })
  }
  return res.status(202).json({ deletion_id: deletionId, queued: true })
}

export default withSuperAdminOnly(handler)
