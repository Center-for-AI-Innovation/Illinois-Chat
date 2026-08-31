import { withAuth, AuthenticatedRequest } from '~/utils/authMiddleware'
import { NextApiResponse } from 'next'
import { runN8nFlow } from '~/server/n8n/runFlow'

export const runN8nFlowBackend = async (
  api_key: string,
  name: string,
  data: any,
  signal?: AbortSignal,
): Promise<any> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 minutes
  const onAbort = () => controller.abort()
  if (signal?.aborted) {
    controller.abort()
  } else {
    signal?.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const n8nResponse = await runN8nFlow({
      apiKey: api_key,
      name,
      data,
      signal: controller.signal,
    })
    return n8nResponse
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(
        'Request timed out after 30 seconds, try "Regenerate Response" button',
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}

export default withAuth(handler)

export const config = {
  maxDuration: 300, // 5 minutes
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { api_key, name, data } = req.body

  if (!api_key || !name || !data) {
    return res.status(400).json({
      error: 'api_key, name, and data are required',
    })
  }

  try {
    const n8nResponse = await runN8nFlowBackend(api_key, name, data)
    return res.status(200).json(n8nResponse)
  } catch (error: any) {
    console.error('Error in runN8nFlow API:', error)

    if (error.message.includes('timed out')) {
      return res.status(408).json({ error: error.message })
    }

    return res.status(500).json({
      error: error.message || 'Internal server error while running N8N flow',
    })
  }
}
