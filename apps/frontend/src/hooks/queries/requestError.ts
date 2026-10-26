/**
 * Turn an API `error` field into a real Error.
 *
 * Validation routes return `error` as `{ message, issues }`, not a string.
 * `new Error(thatObject)` becomes the message "[object Object]". Callers
 * check `instanceof Error`, so a plain object would show up as "Unknown error".
 */
export function toRequestError(error: unknown, fallback: string): Error {
  if (typeof error === 'string') return new Error(error)
  if (error && typeof error === 'object' && 'message' in error) {
    const { message, issues } = error as {
      message: unknown
      issues?: { path?: string; message?: string }[]
    }
    if (typeof message !== 'string' || message.length === 0) {
      return new Error(fallback)
    }
    const details = issues
      ?.map((issue) =>
        issue.path ? `${issue.path}: ${issue.message ?? ''}` : issue.message,
      )
      .filter((part): part is string => Boolean(part))
      .join('; ')
    return new Error(details ? `${message}: ${details}` : message)
  }
  return new Error(fallback)
}
