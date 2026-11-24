// src/pages/api/chat-api/keys/rotate.ts

import { and, eq } from 'drizzle-orm'
import type { NextApiResponse } from 'next'
import { v4 as uuidv4 } from 'uuid'
import { apiKeys, db } from '~/db/dbClient'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.keys.rotate')

type ApiResponse = {
  message?: string
  newApiKey?: string
  error?: string
}

/**
 * API handler to rotate an API key for a user.
 *
 * @param {NextApiRequest} req - The incoming HTTP request.
 * @param {NextApiResponse} res - The outgoing HTTP response.
 * @returns A JSON response indicating the result of the key rotation operation.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse>,
) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const email = req.user?.email
    if (!email) {
      return res.status(400).json({ error: 'User email missing' })
    }

    log.info('rotating API key', { user: req.user?.sub })

    // Retrieve existing API key
    const existingKey = await db
      .select({ key: apiKeys.key })
      .from(apiKeys)
      .where(and(eq(apiKeys.email, email), eq(apiKeys.is_active, true)))

    if (existingKey.length === 0) {
      return res.status(404).json({
        error: 'API key not found for user, please generate one!',
      })
    }

    // Generate new API key
    const rawApiKey = uuidv4()
    const newApiKey = `uc_${rawApiKey.replace(/-/g, '')}`

    // Update the API key
    try {
      await db
        .update(apiKeys)
        .set({ key: newApiKey, is_active: true, modified_at: new Date() })
        .where(eq(apiKeys.email, email))

      log.info('rotated API key', { user: req.user?.sub })

      return res.status(200).json({
        message: 'API key rotated successfully',
        newApiKey,
      })
    } catch (error) {
      log.error('could not update the API key', { user: req.user?.sub }, error)
      return res.status(500).json({ error: 'Error updating API key' })
    }
  } catch (error) {
    log.error('could not rotate the API key', { user: req.user?.sub }, error)
    return res.status(500).json({
      error: (error as Error).message,
    })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
