// A high surrogate not followed by a low one, or a low surrogate not preceded by a high one.
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Recursively sanitizes all string values in an object structure by removing null bytes and problematic escape sequences.
 * @param obj - The object to sanitize. Can be a string, array, object, or any other type.
 * @returns The sanitized version of the input.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\u0000/g, '') // Remove null bytes
    .replace(/\\u0000/g, '') // Remove escaped null bytes
    .replace(/\0/g, '') // Remove another form of null bytes
    .replace(LONE_SURROGATE, '') // Remove unpaired UTF-16 surrogates (invalid in Postgres jsonb/text)
}

/**
 * Truncates text to at most `maxChars` code points, appending `suffix` when cut.
 * Counts code points (not UTF-16 code units) so emoji and other non-BMP
 * characters are never split into lone surrogates.
 */
export function truncateText(
  text: string,
  maxChars: number,
  suffix = '...',
): string {
  const chars = Array.from(text)
  if (chars.length <= maxChars) return text
  return chars.slice(0, maxChars).join('') + suffix
}

/**
 * Recursively sanitizes all values in an object structure.
 * @param obj - The object to sanitize. Can be a string, array, object, or any other type.
 * @returns The sanitized version of the input.
 */
export function sanitizeForLogging(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeText(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogging(item))
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeForLogging(value)
    }
    return sanitized
  }
  return obj
}
