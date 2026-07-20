import { getBackendUrl } from '~/utils/apiUtils'

// A scraped document as far as deletion cares: enough to address it in the
// backend delete (which handles S3 + vector DB + the documents row).
export interface ScrapeRunDoc {
  s3_path: string | null
  url: string | null
  course_name: string | null
}

export interface DeleteScrapeRunDocsResult {
  deletedCount: number
  failedCount: number
}

// Delete every document a scrape run produced by calling the backend /delete
// endpoint once per doc — the same call /api/UIUC-api/deleteDocument makes.
// Best-effort per file via allSettled; the caller decides what to do with a
// non-zero failedCount. `courseName` scopes the call to the caller's project;
// each doc's own course_name is preferred when present.
export async function deleteScrapeRunDocuments(
  courseName: string,
  docs: ScrapeRunDoc[],
): Promise<DeleteScrapeRunDocsResult> {
  const results = await Promise.allSettled(
    docs.map(async (doc) => {
      const params = new URLSearchParams()
      params.append('course_name', doc.course_name || courseName)
      if (doc.s3_path) params.append('s3_path', doc.s3_path)
      if (doc.url) params.append('url', doc.url)

      const response = await fetch(
        `${getBackendUrl()}/delete?${params.toString()}`,
        { method: 'DELETE' },
      )
      if (!response.ok) {
        throw new Error(`Delete failed with status ${response.status}`)
      }
    }),
  )

  const failedCount = results.filter((r) => r.status === 'rejected').length
  return { deletedCount: results.length - failedCount, failedCount }
}
