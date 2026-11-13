import type { AuthenticatedUser } from '~/proxy'
import type { CourseMetadata } from '~/types/courseMetadata'
import { getCourseRole } from '~/server/authorization'

// Secrets are omitted, not set to undefined, so a spread into a save cannot overwrite them.
export function redactCourseMetadataFor(
  user: AuthenticatedUser | undefined,
  metadata: CourseMetadata,
): Omit<CourseMetadata, 'system_prompt' | 'openai_api_key'> {
  if (user) {
    const role = getCourseRole(user, metadata)
    if (role === 'owner' || role === 'admin') return metadata
  }

  const { system_prompt: _prompt, openai_api_key: _key, ...rest } = metadata
  const email = user?.email
  const isApproved = !!email && !!metadata.approved_emails_list?.includes(email)

  return {
    ...rest,
    course_admins: [],
    // Keeps the client-side permission check in runAuthCheck working.
    approved_emails_list: isApproved ? [email] : [],
  }
}
