import { useQuery } from '@tanstack/react-query'
import { type CourseMetadata } from '~/types/courseMetadata'
import {
  fetchCourseMetadata as fetchRawCourseMetadata,
  getBaseUrl,
} from '~/utils/apiUtils'

/** Cache key for a project's raw CourseMetadata, shared by every editor. */
export const courseMetadataQueryKey = (courseName: string) =>
  ['courseMetadata', courseName] as const

interface FetchCourseMetadataVariables {
  courseName: string
}

interface UseFetchCourseMetadataOptions extends FetchCourseMetadataVariables {
  enabled?: boolean
}

interface CourseMetadataResponse {
  courseMetadata: CourseMetadata
  lastAccessedAt: string | null
}

async function fetchCourseMetadata({
  courseName,
}: FetchCourseMetadataVariables): Promise<CourseMetadataResponse> {
  const endpoint = `${getBaseUrl()}/api/UIUC-api/getCourseMetadata?course_name=${courseName}`
  const response = await fetch(endpoint)

  if (!response.ok) {
    throw new Error(
      `Error fetching course metadata: ${response.statusText || response.status}`,
    )
  }

  const data = await response.json()
  if (data.success === false) {
    throw new Error(
      data.message || 'An error occurred while fetching course metadata',
    )
  }

  // Parse is_private if it's a string
  if (
    data.course_metadata &&
    typeof data.course_metadata.is_private === 'string'
  ) {
    data.course_metadata.is_private =
      data.course_metadata.is_private.toLowerCase() === 'true'
  }

  return {
    courseMetadata: data.course_metadata as CourseMetadata,
    lastAccessedAt: data.last_accessed_at ?? null,
  }
}

export function useFetchCourseMetadata({
  courseName,
  enabled = true,
}: UseFetchCourseMetadataOptions) {
  const query = useQuery({
    queryKey: ['courseMetadataWithAccess', courseName],
    queryFn: () => fetchCourseMetadata({ courseName }),
    retry: 1,
    enabled: enabled && Boolean(courseName),
  })

  return {
    ...query,
    // Preserve backward compatibility: `data` returns CourseMetadata directly
    data: query.data?.courseMetadata,
    lastAccessedAt: query.data?.lastAccessedAt ?? null,
  }
}

interface UseCourseMetadataOptions {
  enabled?: boolean
  /**
   * Shown until the first fetch finishes (for example metadata the parent
   * already has). Never written to the cache, so it can't mask fresh data.
   */
  placeholderData?: CourseMetadata
}

/**
 * The project's raw CourseMetadata. Every settings editor reads through this
 * hook so they share one cache entry: it refetches on mount (staleTime 0),
 * and a save through useUpdateCourseMetadata re-renders every reader.
 */
export function useCourseMetadata(
  courseName: string,
  { enabled = true, placeholderData }: UseCourseMetadataOptions = {},
) {
  return useQuery<CourseMetadata>({
    queryKey: courseMetadataQueryKey(courseName),
    queryFn: async () => {
      const metadata = (await fetchRawCourseMetadata(courseName)) as
        | CourseMetadata
        | null
        | undefined
      // A missing project is an error, not empty data: readers keep any copy
      // they have and editors show their "couldn't load" state.
      if (!metadata) throw new Error(`No metadata for project ${courseName}`)
      return metadata
    },
    enabled: enabled && Boolean(courseName),
    placeholderData,
    retry: 1,
  })
}
