import { CourseMetadata } from '~/types/courseMetadata'
import { AuthenticatedRequest } from '~/utils/authMiddleware'
import { AuthenticatedUser } from '~/proxy'
import { NextApiRequest, NextApiResponse } from 'next'
import { withAuth } from '~/utils/authMiddleware'
import { ensureRedisConnected } from '~/utils/redisClient'
import { isSuperAdminAsync } from '~/utils/superAdmins.server'
import {
  resolveCourseName,
  type ExtractedCourseName,
} from '~/server/courseNameExtraction'

// Platform super admins get project access through a live check here rather
// than by being written into each project's `course_admins`. A stored snapshot
// cannot be revoked — every project seeded while someone was listed keeps
// granting them admin rights invisibly — whereas this re-reads the allowlist
// on every request, so removing a grant takes effect immediately.
//
// Three deliberate limits:
//   - Admin tier and below only. The owner tier is never bypassed, so
//     ownership stays meaningful and `withCourseOwnerAccess` is untouched.
//   - Never bypasses the `is_frozen` 403 or the 404 for a missing project.
//   - Only consulted *after* the normal check fails. `&&` short-circuits, so
//     an ordinary authorized request never pays for the extra Redis read.
//
// The synchronous predicates (isCourseAdmin, isCourseOwner, hasCourseAccess)
// stay synchronous on purpose: roughly seventy files read `course_admins`
// through them, and making them async would ripple through all of it.

// Helper function to get course metadata from Redis
export async function getCourseMetadata(
  courseName: string,
): Promise<CourseMetadata | null> {
  try {
    const redisClient = await ensureRedisConnected()
    const rawMetadata = await redisClient.hGet('course_metadatas', courseName)
    if (!rawMetadata) return null
    const parsed = JSON.parse(rawMetadata) as CourseMetadata
    return parsed
  } catch (error) {
    console.error('Error fetching course metadata:', error)
    return null
  }
}

// Check if user is a course admin
export function isCourseAdmin(
  user: AuthenticatedUser,
  courseMetadata: CourseMetadata,
): boolean {
  if (!user.email) return false
  return courseMetadata.course_admins?.includes(user.email) || false
}

// Check if user is the course owner
export function isCourseOwner(
  user: AuthenticatedUser,
  courseMetadata: CourseMetadata,
): boolean {
  if (!user.email) return false
  return courseMetadata.course_owner === user.email
}

// Check if user is an approved user for the course
export function isApprovedUser(
  user: AuthenticatedUser,
  courseMetadata: CourseMetadata,
): boolean {
  if (!user.email) return false
  return courseMetadata.approved_emails_list?.includes(user.email) || false
}

// Check if user has any access to the course (admin, owner, or approved user)
export function hasCourseAccess(
  user: AuthenticatedUser,
  courseMetadata: CourseMetadata,
): boolean {
  return (
    isCourseOwner(user, courseMetadata) ||
    isCourseAdmin(user, courseMetadata) ||
    isApprovedUser(user, courseMetadata) ||
    courseMetadata.allow_logged_in_users === true
  )
}

// Check if user is a regular user (not admin or owner) but has course access
export function isCourseRegularUser(
  user: AuthenticatedUser,
  courseMetadata: CourseMetadata,
): boolean {
  return (
    hasCourseAccess(user, courseMetadata) &&
    !isCourseOwner(user, courseMetadata) &&
    !isCourseAdmin(user, courseMetadata)
  )
}

// Middleware for course-based access control
export function withCourseAccess(courseName: string) {
  return function (
    handler: (
      req: AuthenticatedRequest,
      res: NextApiResponse,
    ) => Promise<void> | void,
  ) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' })
      }

      // Get course metadata
      const courseMetadata = await getCourseMetadata(courseName)
      if (!courseMetadata) {
        return res.status(404).json({
          error: 'Project not found',
          message: `Project '${courseName}' does not exist`,
        })
      }

      // Check if course is frozen/archived
      if (courseMetadata.is_frozen === true) {
        return res.status(403).json({
          error: 'Project is temporarily frozen by the administrator',
          message: `Project '${courseName}' has been temporarily frozen by the administrator`,
        })
      }

      // Check if user has access to the course, or is a platform super admin
      if (
        !hasCourseAccess(req.user, courseMetadata) &&
        !(await isSuperAdminAsync(req.user.email))
      ) {
        return res.status(403).json({
          error: 'Access denied',
          message: `You don't have access to Project '${courseName}'`,
        })
      }

      return handler(req, res)
    })
  }
}

// Middleware for course admin access only
export function withCourseAdminAccess(courseName: string) {
  return function (
    handler: (
      req: AuthenticatedRequest,
      res: NextApiResponse,
    ) => Promise<void> | void,
  ) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' })
      }

      // Get course metadata
      const courseMetadata = await getCourseMetadata(courseName)
      if (!courseMetadata) {
        return res.status(404).json({
          error: 'Project not found',
          message: `Project '${courseName}' does not exist`,
        })
      }

      // Check if course is frozen/archived
      if (courseMetadata.is_frozen === true) {
        return res.status(403).json({
          error: 'Project is temporarily frozen by the administrator',
          message: `Project '${courseName}' has been temporarily frozen by the administrator`,
        })
      }

      // Check if user is course admin or owner, or a platform super admin
      if (
        !isCourseOwner(req.user, courseMetadata) &&
        !isCourseAdmin(req.user, courseMetadata) &&
        !(await isSuperAdminAsync(req.user.email))
      ) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This action requires admin access to Project '${courseName}'`,
        })
      }

      return handler(req, res)
    })
  }
}

// Middleware for course owner access only
export function withCourseOwnerAccess(courseName: string) {
  return function (
    handler: (
      req: AuthenticatedRequest,
      res: NextApiResponse,
    ) => Promise<void> | void,
  ) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' })
      }

      // Get course metadata
      const courseMetadata = await getCourseMetadata(courseName)
      if (!courseMetadata) {
        return res.status(404).json({
          error: 'Project not found',
          message: `Project '${courseName}' does not exist`,
        })
      }

      // Check if course is frozen/archived
      if (courseMetadata.is_frozen === true) {
        return res.status(403).json({
          error: 'Project is temporarily frozen by the administrator',
          message: `Project '${courseName}' has been temporarily frozen by the administrator`,
        })
      }

      // Owner tier: no super-admin bypass by design. See the note at the top
      // of this file.
      if (!isCourseOwner(req.user, courseMetadata)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This action requires owner access to Project '${courseName}'`,
        })
      }

      return handler(req, res)
    })
  }
}

// Middleware for course owner or admin access only
export function withCourseOwnerOrAdminAccess() {
  return function (
    handler: (
      req: AuthenticatedRequest,
      res: NextApiResponse,
    ) => Promise<void> | void,
  ) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' })
      }

      const { courseName, conflict } = extractCourseName(req)
      if (conflict) {
        return res.status(400).json({
          error: 'Conflicting project names',
          message:
            'The request specifies more than one project name; they must match',
        })
      }
      if (!courseName) {
        return res.status(400).json({
          error: 'Course name required',
          message:
            'Course name must be provided in query params, body, or headers',
        })
      }

      // Get course metadata
      const courseMetadata = await getCourseMetadata(courseName)
      if (!courseMetadata) {
        return res.status(404).json({
          error: 'Project not found',
          message: `Project '${courseName}' does not exist`,
        })
      }

      // Check if course is frozen/archived
      if (courseMetadata.is_frozen === true) {
        return res.status(403).json({
          error: 'Project is temporarily frozen by the administrator',
          message: `Project '${courseName}' has been temporarily frozen by the administrator`,
        })
      }

      // Check if user has access to the course, or is a platform super admin
      if (
        !isCourseAdmin(req.user, courseMetadata) &&
        !isCourseOwner(req.user, courseMetadata) &&
        !(await isSuperAdminAsync(req.user.email))
      ) {
        return res.status(403).json({
          error: 'Access denied',
          message: `You don't have access to Project '${courseName}'`,
        })
      }

      // Add course context to request
      req.courseName = courseName

      return await handler(req, res)
    })
  }
}

// Resolve the single project name a request authorizes against. Every place a
// name can appear (query, top-level body, headers) must agree; otherwise the
// result is a conflict and the wrapper rejects the request (#312). Rules live
// in `~/server/courseNameExtraction`, shared with the App Router wrapper.
export function extractCourseName(req: NextApiRequest): ExtractedCourseName {
  return resolveCourseName({
    query: req.query,
    body: req.body,
    headers: req.headers,
  })
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
      > = 'any',
) {
  type AccessLevel = 'any' | 'admin' | 'owner'
  type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

  const hasAccessForLevel = (
    level: AccessLevel,
    user: NonNullable<AuthenticatedRequest['user']>,
    meta: CourseMetadata,
  ): boolean => {
    switch (level) {
      case 'owner':
        return isCourseOwner(user, meta)
      case 'admin':
        return isCourseOwner(user, meta) || isCourseAdmin(user, meta)
      case 'any':
      default:
        return hasCourseAccess(user, meta)
    }
  }

  return function (
    handler: (
      req: AuthenticatedRequest,
      res: NextApiResponse,
    ) => Promise<void> | void,
  ) {
    return async (req: AuthenticatedRequest, res: NextApiResponse) => {
      // Extract course name from request
      const { courseName, conflict } = extractCourseName(req)
      if (conflict) {
        return res.status(400).json({
          error: 'Conflicting project names',
          message:
            'The request specifies more than one project name; they must match',
        })
      }
      if (!courseName) {
        return res.status(400).json({
          error: 'Course name required',
          message:
            'Course name must be provided in query params, body, or headers',
        })
      }

      // Get course metadata
      const courseMetadata = await getCourseMetadata(courseName)
      if (!courseMetadata) {
        return res.status(404).json({
          error: 'Project not found',
          message: `Project '${courseName}' does not exist`,
        })
      }

      // Check if course is frozen/archived
      if (courseMetadata.is_frozen === true) {
        return res.status(403).json({
          error: 'Project is temporarily frozen by the administrator',
          message: `Project '${courseName}' has been temporarily frozen by the administrator`,
        })
      }

      // For public courses, allow unauthenticated access
      if (!courseMetadata.is_private) {
        // Add course context to request
        req.courseName = courseName
        return await handler(req, res)
      }

      // For private courses, require authentication and access check
      return withAuth(
        async (req: AuthenticatedRequest, res: NextApiResponse) => {
          if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' })
          }

          // Determine required access for this HTTP method
          const method = (req.method || 'GET').toUpperCase() as Method
          const requiredLevel: AccessLevel =
            typeof access === 'string' ? access : access[method] ?? 'any'

          // Check access. The super-admin bypass is gated on the tier: at
          // 'owner' the stored owner check is the only way through.
          if (
            !hasAccessForLevel(requiredLevel, req.user, courseMetadata) &&
            !(
              requiredLevel !== 'owner' &&
              (await isSuperAdminAsync(req.user.email))
            )
          ) {
            const label = requiredLevel
            return res.status(403).json({
              error: 'Access denied',
              message: `This ${method} action requires ${label} access to course '${courseName}'`,
            })
          }

          // Add course context to request
          req.courseName = courseName

          return await handler(req, res)
        },
      )(req, res)
    }
  }
}
