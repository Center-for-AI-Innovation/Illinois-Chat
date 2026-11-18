// Ingest error texts end with "(ref: <id>)" so a user can quote the id and we
// can find the request in the logs with `grep rid=<id>`. The id comes from the
// X-Request-ID header that our own API routes set on every response.

/** Appends " (ref: <id>)" only when an id is present. */
export function withRequestRef(
  message: string,
  requestId?: string | null,
): string {
  const id = typeof requestId === 'string' ? requestId.trim() : ''
  return id ? `${message} (ref: ${id})` : message
}

/** Error text for a failed fetch: the `error` field of a JSON body, else `fallback`, plus the ref. */
export async function fetchErrorText(
  response: Response,
  fallback: string,
): Promise<string> {
  let message = fallback
  try {
    const data = await response.json()
    if (typeof data?.error === 'string' && data.error.trim()) {
      message = data.error
    }
  } catch {
    // The body is not JSON (for example a proxy error page): keep the fallback.
  }
  return withRequestRef(message, response.headers.get('x-request-id'))
}

type AxiosLikeError = {
  message?: string
  response?: {
    data?: { message?: unknown }
    headers?: Record<string, unknown>
  }
}

/** Error text for a failed axios call: the server's `message`, else the axios message, plus the ref. */
export function axiosErrorText(error: AxiosLikeError): string {
  const serverMessage = error.response?.data?.message
  const message =
    typeof serverMessage === 'string' && serverMessage
      ? serverMessage
      : (error.message ?? '')
  const requestId = error.response?.headers?.['x-request-id']
  return withRequestRef(
    message,
    typeof requestId === 'string' ? requestId : undefined,
  )
}
