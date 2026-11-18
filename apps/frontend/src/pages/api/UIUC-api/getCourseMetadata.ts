// ~/src/pages/api/UIUC-api/getCourseMetadata.ts
import { type NextApiResponse } from 'next'
import { withCourseAccessFromRequest } from '~/server/authorization'
import { type CourseMetadata } from '~/types/courseMetadata'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { ensureRedisConnected } from '~/utils/redisClient'
import { getProjectTimestamps } from '~/utils/projectTimestamps'
import { db } from '~/db/dbClient'
import { conversations } from '~/db/schema'
import { and, eq, max } from 'drizzle-orm'
import { getLogger } from '~/utils/server/log'
import { MetadataUnavailableError } from '~/utils/server/requestContext'

const log = getLogger('api.getCourseMetadata')

/**
 * Reads the metadata of a project. Returns null only when the project does
 * not exist. Throws MetadataUnavailableError when the read fails, so a route
 * answers 503 and never treats a failed read as "no project".
 */
export const readCourseMetadata = async (
  course_name: string,
): Promise<CourseMetadata | null> => {
  let course_metadata: CourseMetadata | null
  try {
    const redisClient = await ensureRedisConnected()
    const rawMetadata = await redisClient.hGet('course_metadatas', course_name)
    course_metadata = rawMetadata ? JSON.parse(rawMetadata) : null
  } catch (error) {
    throw new MetadataUnavailableError(course_name, error)
  }

  if (!course_metadata) return null

  // Enrich with timestamps from PostgreSQL
  const timestamps = await getProjectTimestamps(course_name)
  return {
    ...course_metadata,
    created_at: timestamps.created_at ?? null,
    last_updated_at: timestamps.last_updated_at ?? null,
  }
}

/**
 * The same read for callers that can continue without the metadata: a failed
 * read is logged and returns null. Do not use it before a write or to answer
 * "not found"; use readCourseMetadata there.
 */
export const getCourseMetadata = async (
  course_name: string,
): Promise<CourseMetadata | null> => {
  try {
    return await readCourseMetadata(course_name)
  } catch (error) {
    log.error('error fetching course metadata', { course: course_name }, error)
    return null
  }
}

export const getUserLastAccessForCourse = async (
  userEmail: string,
  courseName: string,
): Promise<string | null> => {
  try {
    const result = await db
      .select({ lastAccessedAt: max(conversations.updated_at) })
      .from(conversations)
      .where(
        and(
          eq(conversations.user_email, userEmail),
          eq(conversations.project_name, courseName),
        ),
      )

    return result[0]?.lastAccessedAt?.toISOString() ?? null
  } catch (error) {
    log.error('error fetching user last access', { course: courseName }, error)
    return null
  }
}

export default withCourseAccessFromRequest('any')(handler)

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const course_name = req.query.course_name as string
  // Throws on a failed read: the route wrapper answers 503, not 404.
  const course_metadata = await readCourseMetadata(course_name)

  try {
    if (course_metadata == null) {
      return res
        .status(404)
        .json({ success: false, error: 'Project not found' })
    }

    const userEmail = req.user?.email
    const last_accessed_at = userEmail
      ? await getUserLastAccessForCourse(userEmail, course_name)
      : null

    res.status(200).json({ course_metadata: course_metadata, last_accessed_at })
  } catch (error) {
    log.error('error fetching course metadata', undefined, error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
