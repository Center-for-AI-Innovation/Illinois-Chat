import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { type ChatBody } from '@/types/chat'
import { buildPrompt } from '~/app/utils/buildPromptUtils'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.buildPrompt')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const chatBody = req.body as ChatBody

    const { conversation, course_name, courseMetadata } = chatBody

    // **Add a nullish check for 'conversation'**
    if (!conversation) {
      log.warn('conversation is missing from the request body', {
        course: course_name,
      })
      return res.status(400).json({ error: 'Conversation is required.' })
    }

    // Ensure the handler is async and awaits buildPrompt
    const updatedConversation = await buildPrompt({
      conversation: conversation, // Now TypeScript knows 'conversation' is not undefined
      projectName: course_name,
      courseMetadata: courseMetadata,
    })

    return res.status(200).json(updatedConversation)
  } catch (error) {
    log.error('buildPrompt failed', undefined, error)

    return res.status(500).json({
      error: 'An error occurred in buildPromptAPI',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export default withAuth(handler)
