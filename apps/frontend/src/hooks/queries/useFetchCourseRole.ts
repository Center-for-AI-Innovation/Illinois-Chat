import { useQuery } from '@tanstack/react-query'
import { type CourseRole } from '~/server/authorization'
import { getBaseUrl } from '~/utils/apiUtils'

export type { CourseRole }

export class CourseRoleError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'CourseRoleError'
    this.status = status
  }
}

export async function fetchCourseRole(courseName: string): Promise<CourseRole> {
  const response = await fetch(
    `${getBaseUrl()}/api/UIUC-api/getCourseRole?course_name=${encodeURIComponent(courseName)}`,
  )
  if (!response.ok) {
    throw new CourseRoleError(
      response.status,
      `Error fetching course role: ${response.statusText || response.status}`,
    )
  }
  const data = (await response.json()) as { role: CourseRole }
  return data.role
}

export function useFetchCourseRole({
  courseName,
  enabled = true,
}: {
  courseName: string
  enabled?: boolean
}) {
  return useQuery<CourseRole, CourseRoleError>({
    queryKey: ['courseRole', courseName],
    queryFn: () => fetchCourseRole(courseName),
    // Retry network errors and 5xx; 4xx are definitive answers
    retry: (count, error) =>
      count < 2 && !(error instanceof CourseRoleError && error.status < 500),
    enabled: enabled && Boolean(courseName),
  })
}
