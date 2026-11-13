import type { AuthenticatedUser } from '~/proxy'
import type { CourseMetadata } from '~/types/courseMetadata'
import { getCourseRole } from '~/server/authorization'

/**
 * Placeholder sent in place of a stored API key. Clients only need to know
 * that the server holds a key (`home.tsx`, `Chat.tsx`); they never see it.
 */
export const STORED_SECRET_SENTINEL = '__stored_secret__'

/** Course metadata as seen by callers who are not owners or admins. */
export type RedactedCourseMetadata = Omit<
  CourseMetadata,
  'system_prompt' | 'openai_api_key'
> & { openai_api_key?: string }

/**
 * Redact course metadata for the caller.
 *
 * Owners and admins get the full object. Everyone else (members, other
 * logged-in users, anonymous callers) gets a copy where:
 * - `system_prompt` is omitted (the key is absent, not `undefined`, so a
 *   client that spreads this object into a save cannot overwrite the prompt);
 * - `openai_api_key` is replaced by {@link STORED_SECRET_SENTINEL} when a key
 *   is stored, and omitted otherwise;
 * - `course_admins` and `approved_emails_list` are reduced to the caller's own
 *   email (if listed), or `[]`, which keeps the client-side permission check
 *   in `runAuthCheck` working.
 */
export function redactCourseMetadataFor(
  user: AuthenticatedUser | undefined,
  metadata: CourseMetadata,
): RedactedCourseMetadata {
  if (user) {
    const role = getCourseRole(user, metadata)
    if (role === 'owner' || role === 'admin') return metadata
  }

  const email = user?.email
  // Invariant: a caller listed in course_admins is already an admin and
  // returned above, so for course_admins this is always []. Kept as a
  // defensive default in case role resolution changes.
  const onlyCaller = (list: string[] | undefined): string[] =>
    email && list?.includes(email) ? [email] : []

  const {
    system_prompt: _systemPrompt,
    openai_api_key: openaiApiKey,
    ...rest
  } = metadata

  return {
    ...rest,
    ...(openaiApiKey ? { openai_api_key: STORED_SECRET_SENTINEL } : {}),
    course_admins: onlyCaller(metadata.course_admins),
    approved_emails_list: onlyCaller(metadata.approved_emails_list),
  }
}
