/* eslint-disable no-console -- this module is the one place that writes to the console */
// Server-side logger for the Next.js app. One plain-text line per event, in the
// same shape as the Python services:
//
//   2026-11-02T14:03:01.123Z INFO    api.ingest rid=5f3a9c1e path=/api/UIUC-api/ingest course=ece120 queued file=a.pdf
//
// rid, path and course come from the request context (requestContext.ts) when
// one is open. An error is appended as "Name: message" plus its stack frames on
// the following lines. An ERROR line ends with at=<file>:<line>, the place in
// the app that called log.error. Each event is exactly one console call with
// one string.
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

// JSON.stringify turns an Error into {}, so an Error anywhere in a field value
// is written as "Name: message" instead.
function errorReplacer(_key: string, value: unknown): unknown {
  return value instanceof Error
    ? `${value.name}: ${errorMessage(value)}`
    : value
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, errorReplacer) ?? String(value)
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
    .map(formatFrame)
  let text = [`${err.name}: ${errorMessage(err)}`, ...frames].join('\n')
  if (err.cause !== undefined) text += `\nCaused by: ${formatError(err.cause)}`
  return text
}

type SourceMapLike = {
  findEntry(
    line: number,
    column: number,
  ): { originalSource?: string; originalLine?: number; originalColumn?: number }
}

// One of Node's own modules, without an import: this file is also bundled for
// the browser, where the module does not exist and the answer is undefined.
function builtin<T>(name: string): T | undefined {
  try {
    const proc = process as { getBuiltinModule?: (id: string) => unknown }
    return typeof proc.getBuiltinModule === 'function'
      ? (proc.getBuiltinModule(name) as T)
      : undefined
  } catch {
    return undefined
  }
}

const sourceMaps = new Map<string, { mtimeMs: number; map: SourceMapLike }>()

// The source map that the build wrote beside a server chunk (<chunk>.js.map,
// from experimental.serverSourceMaps in next.config.mjs). Next.js leaves
// err.stack unmapped, so the logger reads the map itself. A parsed map is kept
// until its file changes.
function sourceMapFor(file: string): SourceMapLike | undefined {
  const fs = builtin<typeof import('node:fs')>('node:fs')
  const mod = builtin<typeof import('node:module')>('node:module')
  if (!fs || !mod?.SourceMap) return undefined
  try {
    const mapFile = `${file}.map`
    const { mtimeMs } = fs.statSync(mapFile)
    const cached = sourceMaps.get(file)
    if (cached?.mtimeMs === mtimeMs) return cached.map
    const map: SourceMapLike = new mod.SourceMap(
      JSON.parse(fs.readFileSync(mapFile, 'utf8')),
    )
    sourceMaps.set(file, { mtimeMs, map })
    return map
  } catch {
    return undefined
  }
}

// "webpack://app/./src/pages/api/ingest.ts" and "/app/src/pages/api/ingest.ts"
// both become "src/pages/api/ingest.ts". A path in node_modules stays whole.
function tidyFile(file: string): string {
  const path = file.replace(/\\/g, '/')
  if (path.includes('/node_modules/')) return path
  const src = path.lastIndexOf('/src/')
  return src >= 0 ? path.slice(src + 1) : path
}

interface FramePosition {
  file: string
  line: number
  column: number
  mapped: boolean
}

// The file, line and column of one stack frame. For a frame in a built server
// chunk, the position in the source file when the chunk has a source map.
function framePosition(frame: string): FramePosition | undefined {
  const match = /([^\s()]+):(\d+):(\d+)\)?$/.exec(frame.trim())
  if (!match) return undefined
  const file = match[1]!.replace(/^file:\/\//, '')
  const line = Number(match[2])
  const column = Number(match[3])
  if (file.endsWith('.js') && !file.includes('node_modules')) {
    const entry = sourceMapFor(file)?.findEntry(line - 1, column - 1)
    if (entry?.originalSource && entry.originalLine !== undefined) {
      return {
        file: tidyFile(entry.originalSource),
        line: entry.originalLine + 1,
        column: (entry.originalColumn ?? 0) + 1,
        mapped: true,
      }
    }
  }
  return { file: tidyFile(file), line, column, mapped: false }
}

// A mapped frame is rewritten as "    at src/file.ts:line:column". The function
// name is left out because the chunk only has the minified one.
function formatFrame(frame: string): string {
  const position = framePosition(frame)
  return position?.mapped
    ? `    at ${position.file}:${position.line}:${position.column}`
    : frame
}

// Where the caller of `below` is in the app. captureStackTrace leaves out
// `below` and everything above it, so the first frame is the caller even when
// the logger and the caller are in one minified chunk.
function callSite(below: (...args: never[]) => unknown): string | undefined {
  if (typeof Error.captureStackTrace !== 'function') return undefined
  const holder: { stack?: string } = {}
  Error.captureStackTrace(holder, below)
  const frame = (holder.stack ?? '')
    .split('\n')
    .find((line) => /^\s+at /.test(line))
  const position = frame ? framePosition(frame) : undefined
  return position ? `${position.file}:${position.line}` : undefined
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
  const emit = (level: Level) =>
    function write(
      message: string,
      fields?: LogFields | Error,
      err?: unknown,
    ): void {
      if (LEVEL_RANK[level]! < threshold()) return
      // Allow log.error('failed', err) as a shorthand for (message, undefined, err).
      if (fields instanceof Error && err === undefined) {
        err = fields
        fields = undefined
      }
      let pairs = fields as LogFields | undefined
      if (level === 'ERROR') {
        // Only for errors: reading a stack is too slow for every line.
        const at = callSite(write)
        if (at) pairs = { ...pairs, at }
      }
      WRITERS[level](formatLine(level, scope, message, pairs, err))
    }
  return {
    debug: emit('DEBUG'),
    info: emit('INFO'),
    warn: emit('WARNING'),
    error: emit('ERROR'),
  }
}
