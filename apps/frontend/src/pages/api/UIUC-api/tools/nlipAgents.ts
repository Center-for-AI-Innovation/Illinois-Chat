import type { NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { nlipConfigInputSchema } from '~/types/nlip'
import {
  readNlipConfig,
  publicNlipConfig,
  saveNlipConfig,
} from '~/server/nlip/config'

export const config = { api: { bodyParser: { sizeLimit: '128kb' } } }
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  const project = req.courseName
  if (typeof project !== 'string' || !project)
    return res.status(400).json({ error: 'course_name is required' })
  try {
    if (req.method === 'GET')
      return res.json(publicNlipConfig(await readNlipConfig(project)))
    const parsed = nlipConfigInputSchema.safeParse(req.body)
    if (!parsed.success)
      return res.status(400).json({
        error:
          'Invalid NLIP configuration: use unique lowercase agent IDs and complete descriptions',
      })
    return res.json(
      publicNlipConfig(await saveNlipConfig(project, parsed.data)),
    )
  } catch {
    return res.status(503).json({
      error:
        'Could not read or save NLIP configuration; check Redis and ENCRYPTION_MASTER_KEY',
    })
  }
}
export default withCourseOwnerOrAdminAccess()(handler)
