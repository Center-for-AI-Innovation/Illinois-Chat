// Shared by the Pages Router (`~/server/authorization`) and App Router
// (`~/app/api/authorization`) access-control wrappers, so both resolve a
// request's project name with identical rules (#312).

// The keys a project name can arrive under in query params or the request body.
export const COURSE_NAME_KEYS = [
  'courseName',
  'course_name',
  'projectName',
  'project_name',
] as const

// Header variants. Kept for backwards compatibility; no caller sends them.
export const COURSE_NAME_HEADER_KEYS = [
  'x-course-name',
  'x-project_name',
] as const

export interface ExtractedCourseName {
  courseName: string | null
  // True when the request carries conflicting project names across query,
  // body and headers (different values, or a non-string value such as a
  // repeated query key). The caller must reject these, since the access
  // check and the handler could otherwise resolve different projects (#312).
  conflict: boolean
}

export interface CourseNameSources {
  // Parsed query params. A repeated key arrives as an array.
  query?: Record<string, unknown>
  // Parsed JSON body, if any. Non-object bodies carry no name.
  body?: unknown
  // Lower-cased header map.
  headers?: Record<string, unknown>
}

// Gather candidate names from one source into `names`, reading each key the
// same way a handler would (`source[key]`). A present-but-non-string value
// (repeated query key -> array, or an object/number in a JSON body) is
// ambiguous and flags a conflict. Returns whether a conflict was seen.
function collectCourseNames(
  source: unknown,
  keys: readonly string[],
  names: Set<string>,
): boolean {
  if (!source || typeof source !== 'object') return false
  let conflict = false
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key]
    if (value === undefined || value === null || value === '') continue
    if (typeof value !== 'string') {
      conflict = true
      continue
    }
    names.add(value)
  }
  return conflict
}

// Resolve the single project name a request authorizes against. Every place a
// name can appear (query, top-level body, headers) must agree; otherwise the
// request is a conflict and must be rejected. Exact match (Redis keys are
// exact), no trimming or case folding.
export function resolveCourseName({
  query,
  body,
  headers,
}: CourseNameSources): ExtractedCourseName {
  const names = new Set<string>()
  // Evaluate every source: `||` short-circuiting would skip the later ones.
  const conflicts = [
    collectCourseNames(query, COURSE_NAME_KEYS, names),
    collectCourseNames(body, COURSE_NAME_KEYS, names),
    collectCourseNames(headers, COURSE_NAME_HEADER_KEYS, names),
  ]
  const conflict = conflicts.includes(true) || names.size > 1
  const courseName = names.size === 1 ? [...names][0]! : null
  return { courseName, conflict }
}
