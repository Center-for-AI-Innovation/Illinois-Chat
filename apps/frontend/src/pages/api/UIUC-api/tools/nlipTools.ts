import type { NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { getCourseMetadata, hasCourseAccess } from '~/server/authorization'
import {
  askNlipAgent,
  describeNlipError,
  fetchNlipTools,
} from '~/server/nlip/client'

export const config = {
  api: { bodyParser: { sizeLimit: '64kb' } },
  maxDuration: 60,
}

export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method ?? ''))
    return res.status(405).json({ error: 'Method not allowed' })
  const project = req.query.course_name
  if (typeof project !== 'string' || !project)
    return res.status(400).json({ error: 'course_name is required' })
  const metadata = await getCourseMetadata(project)
  if (!metadata) return res.status(404).json({ error: 'Project not found' })
  if (!req.user || metadata.is_frozen || !hasCourseAccess(req.user, metadata))
    return res.status(403).json({ error: 'Access denied' })
  try {
    if (req.method === 'GET')
      return res.json({ tools: await fetchNlipTools(project) })
    const { id, question } = req.body ?? {}
    if (
      typeof id !== 'string' ||
      typeof question !== 'string' ||
      !question.trim() ||
      question.length > 16_000
    )
      return res.status(400).json({
        error: 'Agent id and a question of 1–16000 characters are required',
      })
    return res.json({
      success: true,
      output: await askNlipAgent(project, id, question),
    })
  } catch (error) {
    console.error('[NLIP] tool request failed', {
      project,
      error: describeNlipError(error),
    })
    return res.status(502).json({
      error:
        'NLIP agent request failed; check its configuration and availability',
    })
  }
}
export default withAuth(handler)
