import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { getChatbots, parsePageParams } from '~/utils/getChatbots'

/** Chatbots the caller owns or admins, any privacy. */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const userEmail = req.user?.email
  if (!userEmail) {
    return res.status(400).json({ error: 'No email found in token' })
  }

  const parsed = parsePageParams(req.query)
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error })
  }

  try {
    const data = await getChatbots({
      userEmail,
      user: 'owned',
      ...parsed.params,
    })
    return res.status(200).json(data)
  } catch (error) {
    console.error(
      'Error in getYourChatbots:',
      error instanceof Error ? error.message : String(error),
    )
    return res.status(500).json({ error: 'Failed to fetch your chatbots' })
  }
}

export default withAuth(handler)
