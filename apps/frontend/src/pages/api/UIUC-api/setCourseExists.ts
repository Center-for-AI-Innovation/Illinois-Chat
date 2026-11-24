import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { ensureRedisConnected } from '~/utils/redisClient'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.setCourseExists')

// export const runtime = "edge";
// doesn't seem to work...

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const { course_name } = req.body

  try {
    const redisClient = await ensureRedisConnected()
    await redisClient.set(course_name, 'true')
    res.status(200).json({ success: true })
  } catch (error) {
    log.error('failed to mark the project as existing', undefined, error)
    res.status(500).json({ success: false })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
