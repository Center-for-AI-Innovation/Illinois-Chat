import { v4 as uuidv4 } from 'uuid'

/**
 * One request id follows an upload from the browser, through the Next.js API
 * route, to the Flask backend and the ingest worker, so one search for
 * `rid=<id>` in the logs shows the whole story. The backend accepts the id
 * when it is 1 to 64 letters, digits, `-` or `_`, and otherwise makes its own.
 * See docs/contributing/logging.md, "How the request id travels".
 */
export const REQUEST_ID_HEADER = 'X-Request-ID'

const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Make a new id in the backend's shape: 12 hex characters. */
export function newRequestId(): string {
  return uuidv4().replace(/-/g, '').slice(0, 12)
}

/** True when the value is safe to forward and to log. */
export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value)
}

/**
 * The id an API route uses: the caller's `X-Request-ID` header when it is
 * valid, otherwise a new one. `headers` is Node's incoming headers object,
 * where names are lower-case and a repeated header is an array.
 */
export function requestIdFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string {
  const raw = headers['x-request-id']
  const value = Array.isArray(raw) ? raw[0] : raw
  return isRequestId(value) ? value : newRequestId()
}
