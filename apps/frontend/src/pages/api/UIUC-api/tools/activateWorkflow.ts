import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { switchN8nWorkflow, N8nUnauthorizedError } from '~/utils/n8nClient'

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  try {
    const { api_key, id, activate } = req.query as {
      api_key: string
      id: string
      activate: string
    }

    const activateCapitalized =
      activate.charAt(0).toUpperCase() + activate.slice(1)

    const data = await switchN8nWorkflow({
      apiKey: api_key,
      id,
      activate: activateCapitalized,
    })
    if (data.message) {
      return res.status(400).json({ error: data.message })
    }

    return res.status(200).json(data)
  } catch (error) {
    if (error instanceof N8nUnauthorizedError) {
      return res.status(401).json({ error: error.message })
    }
    return error
  }
}

export default handler
