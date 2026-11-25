import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import axios from 'axios'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { getLogger } from '~/utils/server/log'
import { getLogContext } from '~/utils/server/requestContext'

const log = getLogger('api.scrapeWeb')

interface ScrapeRequestBody {
  url: string | null
  courseName: string | null
  maxUrls: number
  scrapeStrategy: string
}

export default withCourseOwnerOrAdminAccess()(handler)

const formatUrl = (url: string) => {
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url
  }
  return url
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

  const { url, courseName, maxUrls, scrapeStrategy } =
    req.body as ScrapeRequestBody

  if (!url || !courseName) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  try {
    const fullUrl = formatUrl(url)
    const postParams = {
      url: fullUrl,
      courseName: courseName,
      maxPagesToCrawl: maxUrls,
      scrapeStrategy: scrapeStrategy,
      match: formatUrlAndMatchRegex(fullUrl).matchRegex,
      maxTokens: 2000000,
    }

    const crawleeApiUrl = process.env.CRAWLEE_API_URL
    if (!crawleeApiUrl) {
      // The course wrapper has put course= on every line of this request.
      log.error('CRAWLEE_API_URL is not set; cannot start the web scrape')
      return res.status(500).json({
        error: 'CRAWLEE_API_URL is not set',
        message:
          'The web scraper is not configured on this server. Contact support.',
      })
    }
    // Forward the request id so the crawlee and backend lines carry the same rid.
    const rid = getLogContext()?.rid
    const response = await axios.post(
      crawleeApiUrl,
      { params: postParams },
      { headers: rid ? { 'X-Request-ID': rid } : {} },
    )

    return res.status(200).json(response.data)
  } catch (error: any) {
    // crawlee answers a crawl that gave no documents with
    // { error, errorTitle, errorMessage } and one of these statuses:
    //   422 NothingToIngest  each page was empty or an error page
    //   502 NoPageLoaded     no page could be loaded
    //   502 IngestRefused    the backend refused each page
    //   503 CrawlDisabled    crawling is turned off
    //   500                  the crawler itself failed
    const crawlerStatus: number | undefined = error.response?.status
    const result: string | undefined = error.response?.data?.errorTitle
    const message: string = error.response?.data?.errorMessage ?? error.message
    const fields = { url, status: crawlerStatus, result, reason: message }

    if (crawlerStatus === 422) {
      // The website gave nothing to ingest: not a fault on our side, and the
      // crawler has the details under the same rid.
      log.warn('web scrape gave no documents', fields)
    } else if (crawlerStatus) {
      // The crawler answered, and its own lines have the stack.
      log.error('web scrape failed', fields)
    } else {
      // No answer from the crawler (no connection, DNS): the error is ours.
      log.error('web scrape failed', fields, error)
    }

    // Pass the statuses that tell the browser what happened; the rest is a 500.
    const status =
      crawlerStatus === 422 || crawlerStatus === 502 || crawlerStatus === 503
        ? crawlerStatus
        : 500
    return res.status(status).json({
      error: 'Web scraping failed. Please try again later.',
      message,
    })
  }
}
