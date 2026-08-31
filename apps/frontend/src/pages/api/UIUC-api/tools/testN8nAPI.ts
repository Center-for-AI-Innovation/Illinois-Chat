import { withAuth } from '~/utils/authMiddleware'
import { getN8nWorkflows } from '~/utils/n8nClient'

async function handler(req: any, res: any) {
  const { n8nApiKey } = req.body

  const workflows = await getN8nWorkflows({
    apiKey: n8nApiKey,
    limit: 1,
    pagination: true,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown'
    throw new Error(`Unable to fetch n8n tools: ${message}`)
  })

  if (!workflows) {
    throw new Error('Unable to fetch n8n tools: empty response')
  }
  return res.status(200).json({ message: 'Success' })
}

export default withAuth(handler)
