/**
 * Vector search using frontend Drizzle + pgvector (embeddings table).
 * Requires queryEmbedding to be provided (e.g. from a backend /embedQuery endpoint or embedding API).
 */
import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { withCourseAccessFromRequest } from '~/server/authorization'
import { vectorSearchWithDrizzle } from '~/db/vectorSearch'
import { getDocGroupsForVectorSearch } from '~/db/dbHelpers'

export default withCourseAccessFromRequest('any')(handler)

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      queryEmbedding,
      course_name,
      doc_groups = [],
      conversation_id,
      top_n = 100,
    } = req.body

    if (
      !Array.isArray(queryEmbedding) ||
      queryEmbedding.length === 0 ||
      !course_name
    ) {
      return res.status(400).json({
        error:
          'queryEmbedding (number[]) and course_name are required. Get queryEmbedding from your embedding API or backend.',
      })
    }

    // Which groups are disabled and which public groups are searchable is
    // project state, so read it from the database (as the in-process path in
    // fetchContextsViaDrizzleVectorSearch does) instead of the request body,
    // where a client could name another project's group and read its
    // embeddings (#312).
    const { disabled_doc_groups, public_doc_groups } =
      await getDocGroupsForVectorSearch(course_name)

    const data = await vectorSearchWithDrizzle(course_name, {
      queryEmbedding,
      course_name,
      doc_groups,
      disabled_doc_groups,
      public_doc_groups,
      conversation_id,
      top_n,
    })
    return res.status(200).json(data)
  } catch (error) {
    console.error('Error in getContextsDrizzle:', error)
    return res.status(500).json({
      error: 'Internal server error while fetching contexts via Drizzle',
      data: [],
    })
  }
}
