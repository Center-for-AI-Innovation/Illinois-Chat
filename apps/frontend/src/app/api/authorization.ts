import { CourseMetadata } from '~/types/courseMetadata'
import { AuthenticatedRequest } from '~/utils/appRouterAuth'
import { NextRequest, NextResponse } from 'next/server'
import { withAppRouterAuth } from '~/utils/appRouterAuth'
import { ensureRedisConnected } from '~/utils/redisClient'
import { AuthenticatedUser } from '~/proxy'
import {
  COURSE_NAME_HEADER_KEYS,
  COURSE_NAME_KEYS,
  resolveCourseName,
  type ExtractedCourseName,
} from '~/server/courseNameExtraction'

// Helper function to get course metadata from Redis
export async function getCourseMetadata(
  courseName: string,
): Promise<CourseMetadata | null> {
  try {
    const redisClient = await ensureRedisConnected()
    const rawMetadata = await redisClient.hGet('course_metadatas', courseName)
    const course_metadata: CourseMetadata | null = rawMetadata
      ? JSON.parse(rawMetadata)
      : null

    // Use value as-is; Redis-stored JSON should already have correct boolean
    return course_metadata
  } catch (error) {
    console.error('Error occurred while fetching courseMetadata', error)
    return null
  }
}

// Helper function to check if user has access to a course
export function hasCourseAccess(
  user: AuthenticatedUser,
  courseMetadata: CourseMetadata,
): boolean {
  // Check if user is admin
  if (courseMetadata.course_admins?.includes(user.email)) {
    return true
  }

  // Check if user is course owner
  if (user.email === courseMetadata.course_owner) {
    return true
  }

  // Check if user is in the course's allowed users list
  if (courseMetadata.approved_emails_list?.includes(user.email)) {
    return true
  }

  // check if all logged in users have access
  if (courseMetadata.allow_logged_in_users) {
    return true
  }

  return false
}

// Resolve the single project name a request authorizes against. Every place a
// name can appear (query, top-level body, headers) must agree; otherwise the
// result is a conflict and the wrapper rejects the request (#312). Rules live
// in `~/server/courseNameExtraction`, shared with the Pages Router wrapper;
// this only adapts the NextRequest shape to it.
export async function extractCourseName(
  req: NextRequest,
): Promise<ExtractedCourseName> {
  const url = new URL(req.url)
  const query: Record<string, unknown> = {}
  for (const key of COURSE_NAME_KEYS) {
    // Mirror the Pages Router: a repeated key arrives as an array (which the
    // resolver treats as ambiguous), a single one as a string.
    const values = url.searchParams.getAll(key)
    if (values.length === 1) query[key] = values[0]
    else if (values.length > 1) query[key] = values
  }

  const headers: Record<string, unknown> = {}
  for (const key of COURSE_NAME_HEADER_KEYS) {
    const value = req.headers.get(key)
    if (value !== null) headers[key] = value
  }

  // Parse the body for every method that can carry one, not only when nothing
  // else matched, so a body name that disagrees with the query is caught.
  let body: unknown
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await req.clone().json()
    } catch {
      // Non-JSON or empty body: no name to read.
    }
  }

  return resolveCourseName({ query, body, headers })
}

// Middleware that automatically extracts course name and applies access control
export function withCourseAccessFromRequest(
  access:
    | 'any'
    | 'admin'
    | 'owner'
    | Partial<
        Record<
          'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
          'any' | 'admin' | 'owner'
        >
      >,
) {
  return function (
    handler: (
      req: AuthenticatedRequest,
    ) => Promise<NextResponse> | NextResponse,
  ) {
    return async (req: AuthenticatedRequest) => {
      const { courseName, conflict } = await extractCourseName(req)
      if (conflict) {
        return new NextResponse(
          JSON.stringify({
            error: 'Conflicting project names',
            message:
              'The request specifies more than one project name; they must match',
          }),
          { status: 400 },
        )
      }
      if (!courseName) {
        return new NextResponse(
          JSON.stringify({
            error: 'Course name required',
            message:
              'Course name must be provided in query params, body, or headers',
          }),
          { status: 400 },
        )
      }

      // Get course metadata
      const courseMetadata = await getCourseMetadata(courseName)
      if (!courseMetadata) {
        return NextResponse.json(
          {
            error: 'Project not found',
            message: `Project '${courseName}' does not exist`,
          },
          { status: 404 },
        )
      }

      // Check if course is frozen/archived
      if (courseMetadata.is_frozen === true) {
        return NextResponse.json(
          {
            error: 'Project is temporarily frozen by the administrator',
            message: `Project '${courseName}' has been temporarily frozen by the administrator`,
          },
          { status: 403 },
        )
      }

      // Determine required access level for this request
      const method = req.method as
        | 'GET'
        | 'POST'
        | 'PUT'
        | 'PATCH'
        | 'DELETE'
        | 'HEAD'
        | 'OPTIONS'
      const requiredAccess =
        typeof access === 'string' ? access : access[method] || 'any'

      // For public courses, allow unauthenticated access if access level is 'any'
      if (!courseMetadata.is_private && requiredAccess === 'any') {
        // Add course context to request
        req.courseName = courseName
        return await handler(req)
      }

      // For private courses or higher access levels, require authentication
      return withAppRouterAuth(async (req: AuthenticatedRequest) => {
        if (!req.user) {
          return new NextResponse(
            JSON.stringify({ error: 'User not authenticated' }),
            { status: 401 },
          )
        }

        // Check course access for private courses
        if (
          courseMetadata.is_private &&
          !hasCourseAccess(req.user, courseMetadata)
        ) {
          return new NextResponse(
            JSON.stringify({
              error: 'Access denied',
              message: `You don't have access to course '${courseName}'`,
            }),
            { status: 403 },
          )
        }

        // Check specific access level
        if (
          requiredAccess === 'admin' &&
          !courseMetadata.course_admins?.includes(req.user.email)
        ) {
          return new NextResponse(
            JSON.stringify({
              error: 'Access denied',
              message: 'This action requires admin access',
            }),
            { status: 403 },
          )
        }

        if (
          requiredAccess === 'owner' &&
          req.user.email !== courseMetadata.course_owner
        ) {
          return new NextResponse(
            JSON.stringify({
              error: 'Access denied',
              message: 'This action requires course owner access',
            }),
            { status: 403 },
          )
        }

        // Add course context to request
        req.courseName = courseName

        return await handler(req)
      })(req)
    }
  }
}
