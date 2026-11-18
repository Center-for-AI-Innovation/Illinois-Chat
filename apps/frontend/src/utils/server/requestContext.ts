// Per-request log context (request id, path, project) for the Next.js server.
//
// Server-only by convention, but safe to bundle. The browser graph reaches some
// server modules through shared code, so `async_hooks` is imported by its bare
// name (next.config.mjs stubs it for the browser; the `node:` form cannot be
// stubbed) and the store is only built when AsyncLocalStorage is a real class.
// In a browser the store is undefined, runWithLogContext just calls fn, and
// log lines carry no rid.
import { AsyncLocalStorage } from 'async_hooks'

export interface LogContext {
  rid: string
  path?: string
  course?: string
}

const store: AsyncLocalStorage<LogContext> | undefined =
  typeof AsyncLocalStorage === 'function'
    ? new AsyncLocalStorage<LogContext>()
    : undefined

// Same rule as the Python services: accept a caller's id only if it is short
// and plain, so it cannot break or forge a log line.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  if (!store) return fn()
  return store.run(ctx, fn)
}

export function getLogContext(): LogContext | undefined {
  return store?.getStore()
}

// Adds the project name to the open context, if there is one. The course
// access wrappers call this once they know which project a request is for.
export function setLogCourse(course: string): void {
  const ctx = store?.getStore()
  if (ctx) ctx.course = course
}

type HeaderBag =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined

// Returns the request's X-Request-ID when it is valid, else a new short id.
// Works for Pages requests (plain header object) and App requests (Headers).
export function getRequestId(req: { headers?: HeaderBag }): string {
  const headers = req.headers
  const raw =
    typeof headers?.get === 'function'
      ? (headers as Headers).get('x-request-id')
      : (headers as Record<string, string | string[] | undefined>)?.[
          'x-request-id'
        ]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value && REQUEST_ID_PATTERN.test(value)) return value
  // Global Web Crypto, no import: this module is in the client graph.
  // 12 hex characters, the same shape as the backend's uuid4().hex[:12].
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

// Thrown by getCourseMetadata when Redis cannot be read. The route wrappers
// turn it into one ERROR line and a 503, instead of a misleading 404.
export class MetadataUnavailableError extends Error {
  constructor(courseName: string, cause: unknown) {
    super(`could not read the metadata of project ${courseName}`, { cause })
    this.name = 'MetadataUnavailableError'
  }
}
