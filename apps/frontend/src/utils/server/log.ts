/* eslint-disable no-console -- this module is the one place that writes to the console */
// Server-side logger for the Next.js app. One plain-text line per event, in the
// same shape as the Python services:
//
//   2026-11-02T14:03:01.123Z INFO    api.ingest rid=5f3a9c1e path=/api/UIUC-api/ingest course=ece120 queued file=a.pdf
//
// rid, path and course come from the request context (requestContext.ts) when
// one is open. An error is appended as "Name: message" plus its stack frames on
// the following lines. Each event is exactly one console call with one string.
//
// Server-only by convention; harmless in the browser, where there is no
// request context and the line is just a timestamped console message.
import { getLogContext } from './requestContext'

export type LogFields = Record<string, unknown>

export interface Logger {
  debug(message: string, fields?: LogFields | Error, err?: unknown): void
  info(message: string, fields?: LogFields | Error, err?: unknown): void
  warn(message: string, fields?: LogFields | Error, err?: unknown): void
  error(message: string, fields?: LogFields | Error, err?: unknown): void
}

type Level = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

const LEVEL_RANK: Record<string, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  WARN: 30,
  ERROR: 40,
  // There is no CRITICAL writer here; it means "errors only", as in crawlee.
  CRITICAL: 40,
}

// The unknown LOG_LEVEL value that was last reported, so it is reported once.
let reportedUnknownLevel: string | undefined

// Read on every call so a test or a restart with a new LOG_LEVEL takes effect.
// A missing value means INFO; an unknown one means INFO plus one WARNING line,
// as in the Python services and crawlee.
function threshold(): number {
  const env = typeof process === 'undefined' ? undefined : process.env.LOG_LEVEL
  const name = (env ?? '').trim().toUpperCase()
  const rank = LEVEL_RANK[name]
  if (rank !== undefined) return rank
  if (name && env !== reportedUnknownLevel) {
    reportedUnknownLevel = env
    WRITERS.WARNING(
      formatLine('WARNING', 'log', `unknown LOG_LEVEL=${env}, using INFO`),
    )
  }
  return LEVEL_RANK.INFO!
}

// A value must not be able to start a new log line.
function escapeNewlines(text: string): string {
  return text.replace(/\r/g, '\\r').replace(/\n/g, '\\n')
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function formatPairs(fields: LogFields): string[] {
  const pairs: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    pairs.push(`${key}=${escapeNewlines(stringify(value))}`)
  }
  return pairs
}

// Drizzle puts the bound values of a failed query into the error message
// ("Failed query: ...\nparams: a,b,c"). They can hold emails, keys and whole
// documents, so they are cut off; the query text stays.
function errorMessage(err: Error): string {
  return err.message.replace(/\nparams: [\s\S]*$/, '\nparams: <omitted>')
}

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return stringify(err)
  const frames = (err.stack ?? '')
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
  let text = [`${err.name}: ${errorMessage(err)}`, ...frames].join('\n')
  if (err.cause !== undefined) text += `\nCaused by: ${formatError(err.cause)}`
  return text
}

export function formatLine(
  level: Level,
  scope: string,
  message: string,
  fields?: LogFields,
  err?: unknown,
): string {
  const ctx = getLogContext()
  const parts = [new Date().toISOString(), level.padEnd(7), scope]
  const bound: LogFields = ctx
    ? { rid: ctx.rid, path: ctx.path, course: ctx.course }
    : {}
  parts.push(...formatPairs(bound))
  parts.push(escapeNewlines(message))
  if (fields) {
    // A field the context already printed with the same value is not repeated
    // (a handler that passes course= inside a course-wrapped route).
    const extra = Object.fromEntries(
      Object.entries(fields).filter(
        ([key, value]) => bound[key] == null || bound[key] !== value,
      ),
    )
    parts.push(...formatPairs(extra))
  }
  let line = parts.join(' ')
  if (err !== undefined) line += `\n${formatError(err)}`
  return line
}

const WRITERS: Record<Level, (line: string) => void> = {
  DEBUG: (line) => console.log(line),
  INFO: (line) => console.log(line),
  WARNING: (line) => console.warn(line),
  ERROR: (line) => console.error(line),
}

export function getLogger(scope: string): Logger {
  const emit =
    (level: Level) =>
    (message: string, fields?: LogFields | Error, err?: unknown): void => {
      if (LEVEL_RANK[level]! < threshold()) return
      // Allow log.error('failed', err) as a shorthand for (message, undefined, err).
      if (fields instanceof Error && err === undefined) {
        err = fields
        fields = undefined
      }
      WRITERS[level](
        formatLine(level, scope, message, fields as LogFields | undefined, err),
      )
    }
  return {
    debug: emit('DEBUG'),
    info: emit('INFO'),
    warn: emit('WARNING'),
    error: emit('ERROR'),
  }
}
