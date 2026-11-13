import type { AuthenticatedUser } from '~/proxy'
import type { CourseMetadata } from '~/types/courseMetadata'
import { getCourseRole } from '~/server/authorization'

// Only owners and admins may see the full metadata. Everyone else (members,
// non-members, anonymous callers) gets a copy without the system prompt and
// the stored API key, and with the admin / approved email lists reduced to the
// caller's own email, which is enough for the client-side permission check.
export function redactCourseMetadataFor(
  user: AuthenticatedUser | undefined,
  metadata: CourseMetadata,
): CourseMetadata {
  if (user) {
    const role = getCourseRole(user, metadata)
    if (role === 'owner' || role === 'admin') return metadata
  }

  const email = user?.email
  const onlyCaller = (list: string[] | undefined): string[] =>
    email && list?.includes(email) ? [email] : []

  const {
    system_prompt: _systemPrompt,
    openai_api_key: _openaiApiKey,
    ...rest
  } = metadata

  return {
    ...rest,
    course_admins: onlyCaller(metadata.course_admins),
    approved_emails_list: onlyCaller(metadata.approved_emails_list),
  } as CourseMetadata
}
