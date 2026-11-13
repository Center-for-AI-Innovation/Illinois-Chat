import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import {
  getChatbots,
  parsePageParams,
  type GetChatbotsOptions,
  type PageParams,
} from '~/utils/getChatbots'

type SectionOptions = Omit<GetChatbotsOptions, 'userEmail' | keyof PageParams>

/** GET endpoint for one paged hub section; `label` names it in errors, e.g. "shared". */
export function chatbotsSectionHandler(options: SectionOptions, label: string) {
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
        ...options,
        ...parsed.params,
      })
      return res.status(200).json(data)
    } catch (error) {
      console.error(
        `Error fetching ${label} chatbots:`,
        error instanceof Error ? error.message : String(error),
      )
      return res
        .status(500)
        .json({ error: `Failed to fetch ${label} chatbots` })
    }
  }

  return withAuth(handler)
}
