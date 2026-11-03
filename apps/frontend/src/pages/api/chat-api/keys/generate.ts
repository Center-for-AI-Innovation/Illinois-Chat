// src/pages/api/chat-api/keys/generate.ts

import { eq } from 'drizzle-orm'
import type { NextApiResponse } from 'next'
import posthog from 'posthog-js'
import { v4 as uuidv4 } from 'uuid'
import { apiKeys, db } from '~/db/dbClient'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.keys.generate')
type ApiResponse = {
  message?: string
  apiKey?: string
  error?: string
}

/**
 * API endpoint to generate a unique API key for a user.
 * The endpoint checks if the user is authenticated and if a key already exists for the user.
 * If not, it generates a new API key, stores it, and returns it to the user.
 *
 * @param {NextApiRequest} req - The incoming API request.
 * @param {NextApiResponse} res - The outgoing API response.
 * @returns {Promise<void>} The response with the API key or an error message.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse>,
) {
  log.debug('received request to generate an API key')

  if (req.method !== 'POST') {
    log.debug('invalid method', { method: req.method })
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const email = req.user?.email
    if (!email) {
      return res.status(400).json({ error: 'User email missing' })
    }
    const userId = req.user?.sub
    if (!userId) {
      return res.status(400).json({ error: 'User id missing' })
    }

    log.debug('generating API key', { user: userId })

    // Check if the user already has an API key (active or inactive).
    const keys = await db
      .select({ key: apiKeys.key, is_active: apiKeys.is_active })
      .from(apiKeys)
      .where(eq(apiKeys.email, email))

    if (!keys) {
      log.error('could not read API keys from the database', { user: userId })
      throw new Error('Failed to fetch API keys')
    }

    log.debug('existing keys found', { count: keys.length })

    if (keys.some((k) => k.is_active)) {
      log.debug('user already has an active API key', { user: userId })
      return res.status(409).json({ error: 'User already has an API key' })
    }

    // Generate new API key
    const rawApiKey = uuidv4()
    const apiKey = `uc_${rawApiKey.replace(/-/g, '')}`
    log.debug('generated new API key')

    if (keys.length === 0) {
      log.debug('inserting new API key record')
      try {
        await db.insert(apiKeys).values({
          email: email,
          user_id: userId,
          key: apiKey,
          is_active: true,
        })

        log.debug('inserted new API key record')
      } catch (error) {
        log.warn('could not insert the API key record', { user: userId })
        throw error
      }
    } else {
      log.debug('updating existing API key record')
      try {
        await db
          .update(apiKeys)
          .set({
            key: apiKey,
            is_active: true,
            user_id: req.user?.sub,
          })
          .where(eq(apiKeys.email, email))

        log.debug('updated API key record')
      } catch (error) {
        log.warn('could not update the API key record', { user: userId })
        throw error
      }
    }

    posthog.capture('api_key_generated', {
      email,
      apiKey,
    })
    log.debug('API key generation successful', { user: userId })
    return res.status(200).json({
      message: 'API key generated successfully',
      apiKey,
    })
  } catch (error) {
    log.error('could not generate an API key', { user: req.user?.sub }, error)
    posthog.capture('api_key_generation_failed', {
      error: (error as Error).message,
    })
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
