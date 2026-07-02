import { useQuery } from '@tanstack/react-query'
import { type ScrapeRun } from '~/pages/api/scrapeRuns'

interface UseFetchScrapeRunsOptions {
  courseName: string
  enabled?: boolean
}

async function fetchScrapeRuns(courseName: string): Promise<ScrapeRun[]> {
  const response = await fetch(
    `/api/scrapeRuns?course_name=${encodeURIComponent(courseName)}`,
  )

  if (!response.ok) {
    throw new Error(`Error fetching scrape runs: ${response.status}`)
  }

  const data: { runs: ScrapeRun[] } = await response.json()
  return data.runs ?? []
}

// Past web-scrape parameter sets for a project, most-recently-used first.
export function useFetchScrapeRuns({
  courseName,
  enabled = true,
}: UseFetchScrapeRunsOptions) {
  return useQuery({
    queryKey: ['scrapeRuns', courseName],
    queryFn: () => fetchScrapeRuns(courseName),
    retry: 1,
    enabled: enabled && Boolean(courseName),
  })
}
