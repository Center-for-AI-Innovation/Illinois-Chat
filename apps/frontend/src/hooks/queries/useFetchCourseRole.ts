import { useQuery } from '@tanstack/react-query'
import { useAuth } from 'react-oidc-context'
import { type CourseRole } from '~/server/authorization'
import { getBaseUrl } from '~/utils/apiUtils'

export type { CourseRole }

// The endpoint reports 'super_admin' when a platform super admin holds no project role
export type CourseAccessRole = CourseRole | 'super_admin'

export class CourseRoleError extends Error {
  status: number
  requestId?: string

  constructor(status: number, message: string, requestId?: string) {
    super(message)
    this.name = 'CourseRoleError'
    this.status = status
    this.requestId = requestId
  }
}

export async function fetchCourseRole(
  courseName: string,
): Promise<CourseAccessRole> {
  const response = await fetch(
    `${getBaseUrl()}/api/UIUC-api/getCourseRole?course_name=${encodeURIComponent(courseName)}`,
  )
  if (!response.ok) {
    throw new CourseRoleError(
      response.status,
      `Error fetching course role: ${response.statusText || response.status}`,
      response.headers.get('x-request-id') ?? undefined,
    )
  }
  const data = (await response.json()) as { role: CourseAccessRole }
  return data.role
}

export function useFetchCourseRole({
  courseName,
  enabled = true,
}: {
  courseName: string
  enabled?: boolean
}) {
  const auth = useAuth()
  return useQuery<CourseAccessRole, CourseRoleError>({
    // Role is per user, so a different account in the same tab never sees a cached role
    queryKey: ['courseRole', courseName, auth.user?.profile.sub],
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
