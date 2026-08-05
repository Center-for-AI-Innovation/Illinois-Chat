// Shared request validation for the ingest-status polling routes
// (materialsTable/successDocs and materialsTable/docsInProgress).
// These routes are POST-only and REQUIRE at least one filter — there is no
// unfiltered mode, so a large project can never be streamed back wholesale.

export const MAX_FILTER_ITEMS = 1000

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, '')

function toStringArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) return null
    items.push(item)
  }
  return items
}

export type IngestStatusFilters = {
  course_name: string
  filenames: string[]
  /** Normalized (trailing slashes stripped) — compare against rtrim(base_url, '/'). */
  base_urls: string[]
}

export function parseIngestStatusFilters(
  body: unknown,
): IngestStatusFilters | { error: string } {
  const { course_name, filenames, base_urls } = (body ?? {}) as Record<
    string,
    unknown
  >

  if (typeof course_name !== 'string' || course_name.length === 0) {
    return { error: 'course_name is required' }
  }

  const parsedFilenames = toStringArray(filenames)
  if (parsedFilenames === null) {
    return { error: 'filenames must be an array of non-empty strings' }
  }

  const parsedBaseUrls = toStringArray(base_urls)
  if (parsedBaseUrls === null) {
    return { error: 'base_urls must be an array of non-empty strings' }
  }

  const normalizedBaseUrls = parsedBaseUrls
    .map(stripTrailingSlashes)
    .filter((url) => url.length > 0)

  if (parsedFilenames.length === 0 && normalizedBaseUrls.length === 0) {
    return {
      error: 'At least one filter (filenames or base_urls) is required',
    }
  }

  if (parsedFilenames.length + normalizedBaseUrls.length > MAX_FILTER_ITEMS) {
    return {
      error: `Too many filter items (max ${MAX_FILTER_ITEMS} combined)`,
    }
  }

  return {
    course_name,
    filenames: parsedFilenames,
    base_urls: normalizedBaseUrls,
  }
}
