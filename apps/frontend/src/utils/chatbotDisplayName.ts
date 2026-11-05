/**
 * Display names for chatbots.
 *
 * A chatbot's project name is its permanent key: it is the URL segment
 * (/<name>/chat), the Redis / Postgres key and the S3 prefix, so it never
 * changes. The display name is an optional free-text label shown in its place
 * wherever a person reads the chatbot's name. It is not unique and is never
 * used to look anything up; when unset, the project name is shown.
 */

import type { CourseMetadata } from '~/types/courseMetadata'

export const DISPLAY_NAME_MAX_LENGTH = 80

/**
 * Trim, collapse runs of whitespace and drop control characters. Returns
 * null for an empty result, which clears the display name.
 */
export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || null
}

export function getDisplayNameError(raw: string): string | null {
  const normalized = normalizeDisplayName(raw)
  if (normalized && normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`
  }
  return null
}

/** The name to show for a chatbot: its display name, else its project name. */
export function getChatbotDisplayName(
  courseName: string,
  metadata?: Pick<CourseMetadata, 'display_name'> | null,
): string {
  return normalizeDisplayName(metadata?.display_name) ?? courseName
}
