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
    // Retry network errors and 5xx; retry a 401 once in case the token is mid-renewal
    retry: (count, error) => {
      if (!(error instanceof CourseRoleError)) return count < 2
      if (error.status === 401) return count < 1
      return error.status >= 500 && count < 2
    },
    enabled: enabled && Boolean(courseName),
  })
}
