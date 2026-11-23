/* eslint-disable no-console -- this module is the one place that writes to the console */
// Server-side logger for the Next.js app. One plain-text line per event, in the
// same shape as the Python services:
//
//   2026-11-02T14:03:01.123Z INFO    api.ingest rid=5f3a9c1e path=/api/UIUC-api/ingest course=ece120 queued file=a.pdf
//
// rid, path and course come from the request context (requestContext.ts) when
// one is open. An error is appended as "Name: message" plus its stack frames on
// the following lines. An ERROR line ends with at=<file>:<line>, the place in
// the app that called log.error. A newline or another control character in a
// value is escaped, so a value cannot start a line. Each event is exactly one
// console call with one string.
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

// Characters that can break or forge a log line: the C0 and C1 control
// characters (newline, NUL, ESC and the others), DEL, the Unicode line
// separators, and the characters that change the direction of the text.
const CONTROL_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g

const SHORT_ESCAPES: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
}

// Every value goes through here before it is written, so that a value cannot
// start a new log line.
function escapeNewlines(text: string): string {
  return withoutQueryParams(text).replace(CONTROL_CHARACTERS, (found) => {
    const code = found.charCodeAt(0)
    return (
      SHORT_ESCAPES[found] ??
      (code < 0x100
        ? `\\x${code.toString(16).padStart(2, '0')}`
        : `\\u${code.toString(16).padStart(4, '0')}`)
    )
  })
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
    pairs.push(`${escapeNewlines(key)}=${escapeNewlines(stringify(value))}`)
  }
  return pairs
}

// Drizzle puts the bound values of a failed query into the error message
// ("Failed query: ...\nparams: a,b,c"). They can hold emails, keys and whole
// documents, so they are cut off; the query text stays.
// Only for the message of a failed query ("Failed query: ...\nparams: ..."):
// other text that has a line "params:" in it is left as it is.
function withoutQueryParams(text: string): string {
  return text.replace(
    /(Failed query: [\s\S]*?)\nparams: [\s\S]*$/,
    '$1\nparams: <omitted>',
  )
}

function errorMessage(err: Error): string {
  const message = withoutQueryParams(String(err.message))
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...[cut]`
    : message
}

// The stack frames of an error. V8 writes "Name: message" and then the frames;
// a message of several lines can hold a line that looks like a frame, so the
// frames are read from after the message. When the stack does not start with
// the message (it was set by hand, or the message changed later), the frames
// are the lines at the end that start with "at".
function stackFrames(err: Error): string[] {
  const stack = typeof err.stack === 'string' ? err.stack : ''
  const header = `${err.name}: ${err.message}`
  let lines = stack.split('\n')
  if (stack.startsWith(header)) {
    lines = stack.slice(header.length).split('\n')
  } else {
    // Lines after the last frame (an empty line, a note of a library) do not
    // count.
    let end = lines.length
    while (end > 0 && !/^\s+at /.test(lines[end - 1]!)) end--
    let first = end
    while (first > 0 && /^\s+at /.test(lines[first - 1]!)) first--
    lines = lines.slice(first, end)
  }
  return lines
    .filter((line) => /^\s+at /.test(line))
    .map((line) => escapeNewlines(formatFrame(line)))
}

// How many of the errors inside an AggregateError are written.
const MAX_INNER_ERRORS = 3
// The message of an error can be the whole reply of another service.
const MAX_ERROR_MESSAGE_LENGTH = 4000
const MAX_CODE_LENGTH = 100

// "ECONNREFUSED" and the like: Node puts the reason of a failed system call in
// err.code, and the message can be empty.
function errorCode(err: Error): string {
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' || typeof code === 'number'
    ? ` (code=${escapeNewlines(String(code)).slice(0, MAX_CODE_LENGTH)})`
    : ''
}

function errorHead(err: Error): string {
  return `${escapeNewlines(String(err.name))}: ${escapeNewlines(errorMessage(err))}${errorCode(err)}`
}

// A thrown value that is not an Error is cut at this length: it can be a whole
// response object.
const MAX_THROWN_VALUE_LENGTH = 500
// A chain of causes is followed this far. It also ends a chain that loops.
const MAX_CAUSES = 5

// "Name: message" on one line, then the stack frames, then the causes. Only
// the frames and "Caused by:" start a new line, so the text of an error
// message cannot start a fake log line.
function formatError(err: unknown, depth = 0): string {
  if (!(err instanceof Error)) {
    const text = escapeNewlines(stringify(err))
    return text.length > MAX_THROWN_VALUE_LENGTH
      ? `${text.slice(0, MAX_THROWN_VALUE_LENGTH)}...[cut]`
      : text
  }
  const lines = [errorHead(err), ...stackFrames(err)]
  // fetch gives "AggregateError" with an empty message when a host has more
  // than one address: the reasons are in err.errors.
  // Only for an AggregateError: other errors can have an "errors" list with
  // values of a request in it (a validation error).
  const inner = (err as { errors?: unknown }).errors
  if (err.name === 'AggregateError' && Array.isArray(inner)) {
    inner.slice(0, MAX_INNER_ERRORS).forEach((item, index) => {
      const text =
        item instanceof Error
          ? errorHead(item)
          : escapeNewlines(stringify(item)).slice(0, MAX_THROWN_VALUE_LENGTH)
      lines.push(`    error ${index + 1} of ${inner.length}: ${text}`)
    })
  }
  let text = lines.join('\n')
  if (err.cause !== undefined) {
    text +=
      depth + 1 >= MAX_CAUSES
        ? '\nCaused by: (more causes are left out)'
        : `\nCaused by: ${formatError(err.cause, depth + 1)}`
  }
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
    return proc.getBuiltinModule?.(name) as T | undefined
  } catch {
    return undefined
  }
}

// A parsed map takes about 10 times the size of its file in memory, and the
// parse blocks the server (about 60 ms for a 12 MB file). So a map file larger
// than MAX_MAP_BYTES is not read: its frames stay as positions in the chunk.
// Those are the chunks of large packages; the chunks of the app code are small.
// The parsed maps that are kept add up to MAX_CACHED_MAP_BYTES of files at
// most; the map that was not used for the longest time goes first.
export const MAX_MAP_BYTES = 4 * 1024 * 1024
export const MAX_CACHED_MAP_BYTES = 8 * 1024 * 1024

// In order of use: the first entry is the one that was not used for the
// longest time.
const sourceMaps = new Map<
  string,
  { mtimeMs: number; size: number; map: SourceMapLike }
>()

type NodeFs = typeof import('node:fs')
type NodeModule = typeof import('node:module')

// Production only: the chunks that gave no map (no map file, a map that is too
// large or cannot be read). At most MAX_CHUNKS_WITHOUT_MAP are kept, because a
// stack can name any file; the oldest goes first.
export const MAX_CHUNKS_WITHOUT_MAP = 1000
const chunksWithoutMap = new Set<string>()

// The source map that the build wrote beside a server chunk (<chunk>.js.map,
// from experimental.serverSourceMaps in next.config.mjs). Next.js leaves
// err.stack unmapped, so the logger reads the map itself. A parsed map is kept
// until the kept maps become too large or, outside production, its file
// changes.
function sourceMapFor(file: string): SourceMapLike | undefined {
  const fs = builtin<NodeFs>('node:fs')
  const mod = builtin<NodeModule>('node:module')
  if (!fs || !mod?.SourceMap) return undefined
  // The chunks of a production build never change, so there the first answer
  // for a chunk is kept and the file system is not asked again for every
  // frame of every error. Dev rebuilds its chunks, so there the map file is
  // checked on every call.
  const production = process.env.NODE_ENV === 'production'
  if (production) {
    const cached = sourceMaps.get(file)
    if (cached) {
      // Put back at the end: it is now the most recently used.
      sourceMaps.delete(file)
      sourceMaps.set(file, cached)
      return cached.map
    }
    if (chunksWithoutMap.has(file)) return undefined
  }
  const map = readSourceMap(fs, mod.SourceMap, file)
  if (!map && production) {
    if (chunksWithoutMap.size >= MAX_CHUNKS_WITHOUT_MAP) {
      for (const oldest of chunksWithoutMap) {
        chunksWithoutMap.delete(oldest)
        break
      }
    }
    chunksWithoutMap.add(file)
  }
  return map
}

// The parsed map of a chunk, from the kept maps when its file did not change,
// else from the file. Undefined when there is no map that can be used.
function readSourceMap(
  fs: NodeFs,
  SourceMap: NodeModule['SourceMap'],
  file: string,
): SourceMapLike | undefined {
  try {
    const mapFile = `${file}.map`
    const cached = sourceMaps.get(file)
    // Taken out here, and put back below when it is still good: an entry does
    // not stay when its file is gone.
    sourceMaps.delete(file)
    const { mtimeMs, size } = fs.statSync(mapFile)
    if (cached?.mtimeMs === mtimeMs) {
      sourceMaps.set(file, cached)
      return cached.map
    }
    if (size > MAX_MAP_BYTES) return undefined
    const map: SourceMapLike = new SourceMap(
      JSON.parse(fs.readFileSync(mapFile, 'utf8')),
    )
    sourceMaps.set(file, { mtimeMs, size, map })
    let total = 0
    for (const entry of sourceMaps.values()) total += entry.size
    for (const [key, entry] of sourceMaps) {
      if (total <= MAX_CACHED_MAP_BYTES) break
      sourceMaps.delete(key)
      total -= entry.size
    }
    return map
  } catch {
    return undefined
  }
}

// "webpack://app/./src/pages/api/ingest.ts" and "/app/src/pages/api/ingest.ts"
// both become "src/pages/api/ingest.ts". A path in node_modules stays whole.
function tidyFile(file: string): string {
  const path = file.replace(/\\/g, '/')
  // A source with ".." in it is outside the app: the source of a package
  // ("webpack://app/../../src/useMutation.ts"). Cut to src/, it would look
  // like a file of the app.
  if (path.includes('/node_modules/') || path.includes('../')) return path
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
  parts.push(escapeNewlines(String(message)))
  // Fields must be an object with names: a string or an array would be
  // written as 0=a 1=b.
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
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
      // The logger is called from catch blocks and from stream callbacks, so
      // it must not throw.
      try {
        if (LEVEL_RANK[level]! < threshold()) return
        // Allow log.error('failed', err) as a shorthand for (message, undefined, err).
        if (fields instanceof Error && err === undefined) {
          err = fields
          fields = undefined
        }
        let line: string
        try {
          let pairs = fields as LogFields | undefined
          if (level === 'ERROR') {
            // Only for errors: reading a stack is too slow for every line.
            const at = callSite(write)
            if (at) pairs = { ...pairs, at }
          }
          line = formatLine(level, scope, message, pairs, err)
        } catch (failure) {
          // A field or an error that cannot be read (a getter that throws)
          // gives the line without its details.
          line = `${formatLine(level, scope, message)} (the details of this line could not be written: ${escapeNewlines(String(failure))})`
        }
        WRITERS[level](line)
      } catch {
        // Not even the message can be read. Say that a line was lost.
        try {
          console.error(`${level} ${scope} a log line could not be written`)
        } catch {
          // Nothing more can be done.
        }
      }
    }
  return {
    debug: emit('DEBUG'),
    info: emit('INFO'),
    warn: emit('WARNING'),
    error: emit('ERROR'),
  }
}
