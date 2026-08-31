import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { withCourseAccessFromRequest } from '~/pages/api/authorization'
import { getN8nWorkflows, N8nUnauthorizedError } from '~/utils/n8nClient'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { api_key, limit, pagination } = req.query

  if (!api_key || typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key is required' })
  }

  const rawLimit = Array.isArray(limit) ? limit[0] : limit
  const parsedLimit = Number(rawLimit)
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit >= 1
      ? Math.min(Math.floor(parsedLimit), 250)
      : 10

  const paginationEnabled =
    pagination === undefined ||
    pagination === 'true' ||
    pagination === 'True' ||
    pagination === '1'

  try {
    const workflows = await getN8nWorkflows({
      apiKey: api_key,
      limit: safeLimit,
      pagination: paginationEnabled,
    })
    return res.status(200).json(workflows)
  } catch (error) {
    console.error('Error fetching N8N workflows:', error)
    if (error instanceof N8nUnauthorizedError) {
      return res.status(401).json({
        error: `Unable to fetch n8n tools: ${error.message}`,
      })
    }
    return res.status(500).json({
      error: 'Internal server error while fetching N8N workflows',
    })
  }
}

export default withCourseAccessFromRequest('any')(handler)
