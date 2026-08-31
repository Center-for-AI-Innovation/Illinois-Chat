import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import {
  switchN8nWorkflow,
  N8nUnauthorizedError,
  N8nClientError,
} from '~/utils/n8nClient'

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { api_key, id, activate } = req.query as {
    api_key?: string
    id?: string
    activate?: string
  }

  if (!api_key || !id || !activate) {
    return res
      .status(400)
      .json({ error: 'api_key, id, and activate are required' })
  }

  const activateCapitalized =
    activate.charAt(0).toUpperCase() + activate.slice(1)

  try {
    const data = await switchN8nWorkflow({
      apiKey: api_key,
      id,
      activate: activateCapitalized,
    })
    if (data?.message) {
      return res.status(400).json({ error: data.message })
    }

    return res.status(200).json(data)
  } catch (error) {
    console.error('Error switching n8n workflow:', error)
    if (error instanceof N8nUnauthorizedError) {
      return res.status(401).json({ error: error.message })
    }
    // Always answer the request: returning the error object left the client
    // hanging until its own timeout.
    if (error instanceof N8nClientError) {
      return res.status(502).json({ error: error.message })
    }
    return res
      .status(500)
      .json({ error: 'Internal server error while switching N8N workflow' })
  }
}

export default withAuth(handler)
