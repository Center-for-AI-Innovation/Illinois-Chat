import { and, eq } from 'drizzle-orm'
import type { NextApiResponse } from 'next'
import { db, apiKeys } from '~/db/dbClient'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.keys.fetch')

type ApiResponse = {
  apiKey?: string | null
  error?: string
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse>,
) {
  log.debug('fetching API key', { method: req.method })

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const email = req.user?.email
    if (!email) {
      log.warn('no email in the access token; cannot fetch the API key', {
        user: req.user?.sub,
      })
      return res.status(400).json({ error: 'No email found in token' })
    }

    // First delete any inactive keys for this user
    const deleteError = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.email, email), eq(apiKeys.is_active, false)))

    // The delete resolves to its result rows, never to an error (a failure
    // throws), so there is nothing to report here.
    if (deleteError) {
      log.debug('removed inactive API keys', { user: req.user?.sub })
    }

    // Then fetch the remaining (active) key
    const data = await db
      .select({ key: apiKeys.key })
      .from(apiKeys)
      .where(and(eq(apiKeys.email, email), eq(apiKeys.is_active, true)))

    log.debug('active API key lookup done', {
      user: req.user?.sub,
      count: Array.isArray(data) ? data.length : 0,
    })

    if (!data || data.length === 0) {
      return res.status(200).json({ apiKey: null })
    }

    if (data && data.length > 0) {
      return res.status(200).json({ apiKey: data[0]?.key })
    }
  } catch (error) {
    log.error('could not fetch the API key', { user: req.user?.sub }, error)
    return res.status(500).json({
      error: (error as Error).message,
    })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
