import { eq } from 'drizzle-orm'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { documents } from '~/db/schema'
import { connectionManager } from '~/utils/connectionManager'

async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { course_name } = req.query

  if (!course_name || typeof course_name !== 'string') {
    return res.status(400).json({ error: 'course_name parameter is required' })
  }

  try {
    const docsDb = await connectionManager.getDocumentsDb(course_name)
    const data = await docsDb
      .select({
        s3_path: documents.s3_path,
        readable_filename: documents.readable_filename,
        course_name: documents.course_name,
        url: documents.url,
        base_url: documents.base_url,
      })
      .from(documents)
      .where(eq(documents.course_name, course_name))

    const unique = new Map<string, (typeof data)[number]>()
    for (const item of data) {
      const key = JSON.stringify([
        item.s3_path,
        item.readable_filename,
        item.course_name,
        item.url,
        item.base_url,
      ])
      if (!unique.has(key)) {
        unique.set(key, item)
      }
    }

    return res.status(200).json({ distinct_files: Array.from(unique.values()) })
  } catch (error) {
    console.error('Error fetching course data:', error)
    return res.status(500).json({
      error: 'Internal server error while fetching course data',
    })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
