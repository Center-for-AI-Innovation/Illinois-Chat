import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import axios from 'axios'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'
import { db, scrapeMetadataRun } from '~/db/dbClient'

interface ScrapeRequestBody {
  url: string | null
  courseName: string | null
  maxUrls: number
  scrapeStrategy: string
  // Only present on an "unchanged reuse" re-ingest. Absent for new/changed scrapes.
  deleteMissing?: boolean
  updateExisting?: boolean
  addNew?: boolean
}

export default withCourseOwnerOrAdminAccess()(handler)

const formatUrl = (url: string) => {
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url
  }
  // Canonicalize trailing slashes.
  return url.replace(/\/+$/, '')
}

const formatUrlAndMatchRegex = (url: string) => {
  // fullUrl always starts with http://. Is the starting place of the scrape.
  // baseUrl is used to construct the match statement.

  // Ensure the url starts with 'http://'
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url
  }

  // Extract the base url including the path
  const baseUrl = (
    url.replace(/^https?:\/\//i, '').split('?')[0] as string
  ).replace(/\/$/, '') // Remove protocol (http/s), split at '?', and remove trailing slash

  const matchRegex = `http?(s)://**${baseUrl}/**`

  return {
    fullUrl: baseUrl,
    matchRegex: matchRegex,
  }
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url, courseName, maxUrls, scrapeStrategy, deleteMissing, updateExisting, addNew } =
    req.body as ScrapeRequestBody

  if (!url || !courseName) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  try {
    const fullUrl = formatUrl(url)

    // Record the scrape parameters so users can reuse them on future scrapes.
    // One row per distinct (course_name, url, max_urls, scrape_strategy);
    // re-running an identical scrape just bumps last_run_at. We need the row id
    // to thread to Crawlee (so ingested docs get linked to this scrape). A DB
    // failure here must not block the actual scrape, so it's best-effort.
    let scrapeMetadataRunId: string | undefined
    try {
      const rows = await db
        .insert(scrapeMetadataRun)
        .values({
          course_name: courseName,
          url: fullUrl,
          max_urls: maxUrls,
          scrape_strategy: scrapeStrategy,
        })
        .onConflictDoUpdate({
          target: [
            scrapeMetadataRun.course_name,
            scrapeMetadataRun.url,
            scrapeMetadataRun.max_urls,
            scrapeMetadataRun.scrape_strategy,
          ],
          set: { last_run_at: new Date() },
        })
        .returning({ id: scrapeMetadataRun.id })
      scrapeMetadataRunId = rows[0]?.id
    } catch (recordError) {
      console.error('Failed to record scrape run metadata:', recordError)
    }

    const postParams = {
      url: fullUrl,
      courseName: courseName,
      maxPagesToCrawl: maxUrls,
      scrapeStrategy: scrapeStrategy,
      match: formatUrlAndMatchRegex(fullUrl).matchRegex,
      maxTokens: 2000000,
      // Threaded to Crawlee -> each page's /ingest body -> the worker, which
      // links the resulting document to this scrape run. The three flags are
      // only meaningful on an unchanged-reuse re-ingest (otherwise undefined).
      scrapeMetadataRunId,
      deleteMissing,
      updateExisting,
      addNew,
    }

    const crawleeApiUrl = process.env.CRAWLEE_API_URL
    if (!crawleeApiUrl) {
      return res.status(500).json({ error: 'CRAWLEE_API_URL is not set' })
    }
    const response = await axios.post(crawleeApiUrl, { params: postParams })

    return res.status(200).json(response.data)
  } catch (error: any) {
    console.error('Web scraping error:', error)

    return res.status(500).json({
      error: 'Web scraping failed. Please try again later.',
      message: error.message,
    })
  }
}
