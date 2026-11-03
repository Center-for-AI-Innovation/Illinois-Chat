// fetch() for calls from Next API routes to the Python backend (or the ingest
// bridge). Forwards the request id so one grep follows a request across
// services, and logs one ERROR line when the backend answers with an error
// status. Returns the response unchanged; callers still decide what to do.
// No timeout on purpose: scrape and Canvas calls run for minutes.
// Server-only by convention.
import { getLogger } from './log'
import { getLogContext } from './requestContext'

const log = getLogger('backendFetch')

function withRequestId(
  headers: HeadersInit | undefined,
  rid: string,
): HeadersInit {
  if (headers instanceof Headers || Array.isArray(headers)) {
    const merged = new Headers(headers)
    merged.set('X-Request-ID', rid)
    return merged
  }
  return { ...headers, 'X-Request-ID': rid }
}

// Path only: query strings can carry keys and user input.
function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url.split('?')[0]!
  }
}

export async function backendFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const rid = getLogContext()?.rid
  const requestInit = rid
    ? { ...init, headers: withRequestId(init.headers, rid) }
    : init
  const method = (init.method ?? 'GET').toUpperCase()
  const started = Date.now()
  const response = await fetch(url, requestInit)
  const ms = Date.now() - started
  const what = `backend ${response.status} ${method} ${pathOf(url)}`

  if (response.ok) {
    log.debug(what, { ms })
    return response
  }

  // Read a copy so the caller can still read the body.
  let body: string
  try {
    body = (await response.clone().text()).slice(0, 500)
  } catch (err) {
    body = `<unreadable: ${err instanceof Error ? err.message : String(err)}>`
  }
  log.error(what, { ms, body })
  return response
}
