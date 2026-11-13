import { connectionManager } from '~/utils/connectionManager'
import posthog from 'posthog-js'
import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { type CourseDocument } from '~/types/courseMaterials'
import { and, eq, asc, desc, sql, type SQL } from 'drizzle-orm'
import { documents, documentsDocGroups, docGroups } from '~/db/schema'
import { type PgColumn } from 'drizzle-orm/pg-core'
import { withCourseAccessFromRequest } from '~/server/authorization'
import {
  buildMaterialFilterConditions,
  FilterValidationError,
} from '~/server/materialFilters'

type FetchDocumentsResponse = {
  final_docs?: CourseDocument[]
  total_count?: number
  error?: string
}

/**
 * API handler to delete an API key for a user.
 *
 * @param {AuthenticatedRequest} req - The incoming HTTP request.
 * @param {NextApiResponse} res - The outgoing HTTP response.
 * @returns A JSON response indicating the result of the delete operation.
 */
async function fetchDocuments(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    from: fromStr,
    to: toStr,
    course_name,
    filter_key: search_key,
    filter_value: search_value,
    filters: rawFilters,
    sort_column: rawSortColumn,
    sort_direction,
  } = req.query

  let sort_column = rawSortColumn as string
  let sort_dir = sort_direction === 'asc' // Convert 'asc' to true, 'desc' to false

  if (typeof fromStr !== 'string' || typeof toStr !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing required query parameters: from and to' })
  }

  if (sort_column == null || sort_dir == null) {
    sort_column = 'created_at'
    sort_dir = false // 'desc' equivalent
  }

  const from = parseInt(fromStr)
  const to = parseInt(toStr)

  let filterConditions: SQL[]
  try {
    filterConditions = buildMaterialFilterConditions(rawFilters, {
      readable_filename: documents.readable_filename,
      url: documents.url,
      base_url: documents.base_url,
    })
  } catch (error) {
    if (error instanceof FilterValidationError) {
      return res.status(400).json({ error: error.message })
    }
    throw error
  }

  try {
    const db = await connectionManager.getDocumentsDb(course_name as string)

    let foundDocs: any[] = []
    let finalError = null

    // Helper function to get the sort column
    const getSortColumn = () => {
      if (typeof sort_column === 'string' && sort_column in documents) {
        return documents[sort_column as keyof typeof documents] as PgColumn
      }
      return documents.id
    }

    const baseQuery = {
      id: documents.id,
      course_name: documents.course_name,
      readable_filename: documents.readable_filename,
      s3_path: documents.s3_path,
      url: documents.url,
      created_at: documents.created_at,
      doc_groups: sql`array_remove(array_agg(${docGroups.name}), null)`,
    }

    const conditions: SQL[] = [eq(documents.course_name, course_name as string)]
    if (
      search_key &&
      search_value &&
      typeof search_key === 'string' &&
      search_key in documents
    ) {
      // Legacy single-filter parameters
      const searchColumn = documents[
        search_key as keyof typeof documents
      ] as PgColumn
      conditions.push(sql`${searchColumn} ILIKE ${`%${search_value}%`}`)
    }
    conditions.push(...filterConditions)
    const whereClause = and(...conditions)

    try {
      foundDocs = await db
        .select(baseQuery)
        .from(documents)
        .leftJoin(
          documentsDocGroups,
          eq(documents.id, documentsDocGroups.document_id),
        )
        .leftJoin(docGroups, eq(documentsDocGroups.doc_group_id, docGroups.id))
        .where(whereClause)
        .groupBy(documents.id)
        .orderBy(
          sort_dir === true ? asc(getSortColumn()) : desc(getSortColumn()),
        )
        .limit(to - from + 1)
        .offset(from)
    } catch (error) {
      finalError = error
    }

    if (finalError) {
      throw finalError
    }
    if (!foundDocs) {
      throw new Error('Failed to fetch documents')
    }

    let count
    let countError

    // Count uses the same conditions as the listing
    try {
      const countQuery = await db
        .select({ count: sql`count(distinct ${documents.id})` })
        .from(documents)
        .where(whereClause)

      count = countQuery[0]?.count ?? 0
      countError = null
    } catch (error) {
      count = 0
      countError = error
    }

    if (countError) {
      throw countError
    }

    const final_docs = foundDocs.map((doc) => ({
      ...doc,
      doc_groups: doc.doc_groups || [],
    })) as CourseDocument[]

    return res.status(200).json({ final_docs, total_count: count ?? undefined })
  } catch (error) {
    console.error('Failed to fetch documents:', error)
    posthog.capture('fetch_materials_failed', {
      error: (error as any).message,
      course_name: course_name,
    })
    return res.status(500).json({ error: (error as any).message })
  }
}

export default withCourseAccessFromRequest('any')(fetchDocuments)
