import { type NextApiResponse } from 'next'
import { getCourseMetadata, getCourseRole } from '~/server/authorization'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (!req.user) {
    return res.status(401).json({ error: 'User not authenticated' })
  }

  const raw = req.query.course_name
  const courseName = Array.isArray(raw) ? raw[0] : raw
  if (!courseName) {
    return res.status(400).json({ error: 'course_name is required' })
  }

  const metadata = await getCourseMetadata(courseName)
  if (!metadata) {
    return res.status(404).json({ error: 'Project not found' })
  }
  if (metadata.is_frozen === true) {
    return res
      .status(403)
      .json({ error: 'Project is temporarily frozen by the administrator' })
  }

  return res.status(200).json({ role: getCourseRole(req.user, metadata) })
}

export default withAuth(handler)
