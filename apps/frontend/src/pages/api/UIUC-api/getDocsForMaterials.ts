import { eq } from 'drizzle-orm'
import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { connectionManager } from '~/utils/connectionManager'
import { documents } from '~/db/schema'
import { withCourseAccessFromRequest } from '~/server/authorization'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.getDocsForMaterials')

// export const runtime = 'edge'

const getCourseDocumentsHandler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  const { fileName, courseName } = req.body as {
    fileName: string
    courseName: string
  }

  // Ensure courseNameFromBody is provided
  if (!courseName) {
    return res
      .status(400)
      .json({ error: 'Course name is missing in request body' })
  }

  const documents = await getCourseDocuments(courseName)

  if (documents === null) {
    return res.status(500).json({ error: 'Error fetching course documents' })
  }

  return res.status(200).json(documents)
}

interface CourseDocuments {
  readable_filename: string
  url: string
  s3_path: string
  created_at: string
  base_url: string
}

export const getCourseDocuments = async (
  course_name: string,
): Promise<CourseDocuments[] | null> => {
  if (!course_name) {
    log.warn('course name is missing')
    return null
  }
  try {
    const db = await connectionManager.getDocumentsDb(course_name)
    const data = await db
      .select({
        readable_filename: documents.readable_filename,
        url: documents.url,
        s3_path: documents.s3_path,
        created_at: documents.created_at,
        base_url: documents.base_url,
      })
      .from(documents)
      .where(eq(documents.course_name, course_name))

    if (data.length === 0) {
      log.warn('no documents found for the project')
      return null
    }

    return data.map((doc) => ({
      readable_filename: doc.readable_filename || '',
      url: doc.url || '',
      s3_path: doc.s3_path || '',
      created_at: doc.created_at?.toISOString() || '',
      base_url: doc.base_url || '',
    }))
  } catch (error) {
    log.error(
      'unexpected error while fetching course documents',
      undefined,
      error,
    )
    return null
  }
}

export default withCourseAccessFromRequest('any')(getCourseDocumentsHandler)
