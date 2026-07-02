import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { db, scrapeMetadataRun } from '~/db/dbClient'
import { desc, eq } from 'drizzle-orm'

export interface ScrapeRun {
  id: string
  course_name: string
  url: string
  max_urls: number | null
  scrape_strategy: string | null
  created_at: string
  last_run_at: string
}

// GET /api/scrapeRuns?course_name=<project> -> past scrape param sets, most-recent first
//
// One row per distinct (url, max_urls, scrape_strategy) thanks to the upsert in
// /api/scrapeWeb.
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const courseName =
    (req.query.course_name as string) || (req.query.courseName as string)

  if (!courseName) {
    return res.status(400).json({ error: 'Missing required course_name' })
  }

  if (req.method === 'GET') {
    try {
      const runs = await db
        .select()
        .from(scrapeMetadataRun)
        .where(eq(scrapeMetadataRun.course_name, courseName))
        .orderBy(desc(scrapeMetadataRun.last_run_at))

      return res.status(200).json({ runs })
    } catch (error) {
      console.error('Error fetching scrape runs:', error)
      return res.status(500).json({
        error: 'Failed to fetch scrape runs',
        details: (error as Error).message,
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withCourseOwnerOrAdminAccess()(handler)
