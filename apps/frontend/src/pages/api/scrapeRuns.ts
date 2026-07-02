import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import {
  db,
  scrapeMetadataRun,
  scrapeMetadataDocuments,
  documents,
} from '~/db/dbClient'
import { and, desc, eq } from 'drizzle-orm'
import { deleteScrapeRunDocuments } from '~/utils/scrapeRunFiles'

export interface ScrapeRun {
  id: string
  course_name: string
  url: string
  max_urls: number | null
  scrape_strategy: string | null
  created_at: string
  last_run_at: string
}

// GET    /api/scrapeRuns?course_name=<project>            -> past scrape param sets, most-recent first
// DELETE /api/scrapeRuns?course_name=<project>&id=<uuid>  -> remove one saved scrape
//
// One row per distinct (url, max_urls, scrape_strategy) thanks to the upsert in
// /api/scrapeWeb. Deleting only removes the reusable parameter row; it does not
// touch any scraped documents.
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

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    if (!id) {
      return res.status(400).json({ error: 'Missing required id' })
    }

    const deleteFiles = req.query.delete_files === 'true'

    try {
      // When asked, delete the documents this scrape produced BEFORE removing
      // the run row. Look them up via the junction so we only touch this run's
      // pages, then route each through the backend /delete (S3 + vectors + row).
      if (deleteFiles) {
        const linkedDocs = await db
          .select({
            s3_path: documents.s3_path,
            url: documents.url,
            course_name: documents.course_name,
          })
          .from(scrapeMetadataDocuments)
          .innerJoin(
            documents,
            eq(scrapeMetadataDocuments.document_id, documents.id),
          )
          .where(eq(scrapeMetadataDocuments.scrape_metadata_run_id, id))

        const { deletedCount, failedCount } = await deleteScrapeRunDocuments(
          courseName,
          linkedDocs,
        )

        // Any failure: keep the run row (and its junction links) so the user can
        // retry, and report what happened.
        if (failedCount > 0) {
          return res.status(500).json({
            error: 'Some files could not be deleted; saved scrape kept.',
            deletedCount,
            failedCount,
          })
        }
      }

      // Scope to BOTH id and course_name so a row can only ever be deleted
      // within the project the caller has access to. Junction rows cascade.
      await db
        .delete(scrapeMetadataRun)
        .where(
          and(
            eq(scrapeMetadataRun.id, id),
            eq(scrapeMetadataRun.course_name, courseName),
          ),
        )

      return res.status(200).json({ success: true })
    } catch (error) {
      console.error('Error deleting scrape run:', error)
      return res.status(500).json({
        error: 'Failed to delete scrape run',
        details: (error as Error).message,
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export default withCourseOwnerOrAdminAccess()(handler)
