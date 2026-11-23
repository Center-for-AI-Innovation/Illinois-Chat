/* @vitest-environment node */

import fs, { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CACHED_MAP_BYTES,
  MAX_CHUNKS_WITHOUT_MAP,
  MAX_MAP_BYTES,
  getLogger,
} from '../log'
import { runWithLogContext } from '../requestContext'

const TS = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z'

function spies() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  }
}

describe('getLogger', () => {
  const savedLevel = process.env.LOG_LEVEL
  beforeEach(() => {
    delete process.env.LOG_LEVEL
  })
  afterEach(() => {
    if (savedLevel === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = savedLevel
  })

  it('writes one line with timestamp, padded level, scope and fields', () => {
    const c = spies()
    getLogger('api.ingest').info('queued ingest', {
      file: 'a.pdf',
      size: 12,
      skipped: undefined,
      none: null,
    })
    expect(c.log).toHaveBeenCalledTimes(1)
    const [line, ...rest] = c.log.mock.calls[0]!
    expect(rest).toEqual([])
    expect(line).toMatch(
      new RegExp(
        `^${TS} INFO    api\\.ingest queued ingest file=a\\.pdf size=12$`,
      ),
    )
  })

  it('adds rid, path and course from the request context', () => {
    const c = spies()
    runWithLogContext({ rid: 'abc123', path: '/api/x', course: 'ece120' }, () =>
      getLogger('api').info('hello'),
    )
    runWithLogContext({ rid: 'r2' }, () => getLogger('api').info('no path'))
    expect(c.log.mock.calls[0]![0]).toMatch(
      new RegExp(
        `^${TS} INFO    api rid=abc123 path=/api/x course=ece120 hello$`,
      ),
    )
    expect(c.log.mock.calls[1]![0]).toMatch(
      new RegExp(`^${TS} INFO    api rid=r2 no path$`),
    )
  })

  it('does not repeat a field the context already printed', () => {
    const c = spies()
    runWithLogContext({ rid: 'abc123', course: 'ece120' }, () => {
      getLogger('api').info('same', { course: 'ece120', file: 'a.pdf' })
      getLogger('api').info('other', { course: 'cs101' })
    })
    expect(c.log.mock.calls[0]![0]).toMatch(
      new RegExp(
        `^${TS} INFO    api rid=abc123 course=ece120 same file=a\\.pdf$`,
      ),
    )
    expect(c.log.mock.calls[1]![0]).toMatch(
      new RegExp(
        `^${TS} INFO    api rid=abc123 course=ece120 other course=cs101$`,
      ),
    )
  })

  it('routes levels to console.log / warn / error with Python level names', () => {
    process.env.LOG_LEVEL = 'debug'
    const c = spies()
    const log = getLogger('s')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(c.log).toHaveBeenCalledTimes(2)
    expect(c.log.mock.calls[0]![0]).toMatch(/ DEBUG   s d$/)
    expect(c.log.mock.calls[1]![0]).toMatch(/ INFO    s i$/)
    expect(c.warn).toHaveBeenCalledTimes(1)
    expect(c.warn.mock.calls[0]![0]).toMatch(/ WARNING s w$/)
    expect(c.error).toHaveBeenCalledTimes(1)
    expect(c.error.mock.calls[0]![0]).toMatch(/ ERROR   s e at=\S+:\d+$/)
  })

  it('drops DEBUG at the default level and honours higher thresholds', () => {
    const c = spies()
    getLogger('s').debug('hidden')
    expect(c.log).not.toHaveBeenCalled()

    process.env.LOG_LEVEL = 'nonsense' // unknown falls back to INFO
    getLogger('s').debug('hidden')
    getLogger('s').info('shown')
    expect(c.log).toHaveBeenCalledTimes(1)
    // ...and says so once, not on every call.
    expect(c.warn).toHaveBeenCalledTimes(1)
    expect(c.warn.mock.calls[0]![0]).toMatch(
      new RegExp(`^${TS} WARNING log unknown LOG_LEVEL=nonsense, using INFO$`),
    )
    c.warn.mockClear()

    process.env.LOG_LEVEL = 'WARNING'
    getLogger('s').info('hidden')
    getLogger('s').warn('shown')
    expect(c.log).toHaveBeenCalledTimes(1)
    expect(c.warn).toHaveBeenCalledTimes(1)
  })

  it('treats CRITICAL as errors only instead of silencing everything', () => {
    const c = spies()
    process.env.LOG_LEVEL = 'critical'
    getLogger('s').warn('hidden')
    getLogger('s').error('shown')
    expect(c.warn).not.toHaveBeenCalled()
    expect(c.error).toHaveBeenCalledTimes(1)
  })

  it('escapes newlines in the message and in field values', () => {
    const c = spies()
    getLogger('s').info('two\nlines\r', { body: 'a\nb', obj: { k: 'v' } })
    const line = c.log.mock.calls[0]![0] as string
    expect(line).not.toContain('\n')
    expect(line).toMatch(/ two\\nlines\\r body=a\\nb obj=\{"k":"v"\}$/)
  })

  it('renders values JSON cannot represent', () => {
    const c = spies()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    getLogger('s').info('odd', { circular, fn: () => 1 })
    expect(c.log.mock.calls[0]![0]).toMatch(
      / odd circular=\[object Object\] fn=\(\) => 1$/,
    )
  })

  it('appends an error as name: message plus stack frames, in the same call', () => {
    const c = spies()
    const err = new TypeError('bad input')
    getLogger('api').error('handler failed', { status: 500 }, err)
    expect(c.error).toHaveBeenCalledTimes(1)
    const lines = (c.error.mock.calls[0]![0] as string).split('\n')
    expect(lines[0]).toMatch(
      / ERROR   api handler failed status=500 at=\S+:\d+$/,
    )
    expect(lines[1]).toBe('TypeError: bad input')
    expect(lines.length).toBeGreaterThan(2)
    for (const frame of lines.slice(2)) expect(frame).toMatch(/^\s+at /)
  })

  it('accepts the error in the fields position', () => {
    const c = spies()
    getLogger('api').error('failed', new Error('boom'))
    const lines = (c.error.mock.calls[0]![0] as string).split('\n')
    expect(lines[0]).toMatch(/ ERROR   api failed at=\S+:\d+$/)
    expect(lines[1]).toBe('Error: boom')
  })

  it('prints the cause chain and errors without a stack', () => {
    const c = spies()
    const cause = new Error('connect ECONNREFUSED')
    cause.stack = undefined
    const err = new Error('outer', { cause })
    getLogger('s').error('x', undefined, err)
    const text = c.error.mock.calls[0]![0] as string
    expect(text).toContain('\nError: outer\n')
    expect(text).toMatch(/\nCaused by: Error: connect ECONNREFUSED$/)
  })

  it('omits the bound values of a failed database query', () => {
    const c = spies()
    const cause = new Error(
      'Failed query: insert into "t" ("a") values ($1)\nparams: a@b.edu,{"key":"x"}',
    )
    getLogger('db').error('write failed', new Error('outer', { cause }))
    const line = c.error.mock.calls[0]![0] as string
    expect(line).toContain(
      'Caused by: Error: Failed query: insert into "t" ("a") values ($1)\\nparams: <omitted>',
    )
    expect(line).not.toContain('a@b.edu')
  })

  it('keeps the message of an error on one line, so it cannot start a fake line', () => {
    const c = spies()
    const err = new Error(
      "Ollama model 'm'\n2026-11-18T00:00:00.000Z INFO    api.admin forged line' not found",
      { cause: new Error('inner\r\nERROR fake\u0000\u2028x') },
    )
    getLogger('llm').error('chat request failed', err)
    const lines = (c.error.mock.calls[0]![0] as string).split('\n')
    expect(lines[1]).toBe(
      "Error: Ollama model 'm'\\n2026-11-18T00:00:00.000Z INFO    api.admin forged line' not found",
    )
    // After the first line, a line is the error, a stack frame or a cause.
    for (const line of lines.slice(1)) {
      expect(line).toMatch(/^(\s+at |Caused by: |Error: )/)
    }
    expect(lines.at(-1)).toMatch(
      /^(\s+at |Caused by: Error: inner\\r\\nERROR fake\\x00\\u2028x$)/,
    )
    expect(c.error.mock.calls[0]![0]).toContain(
      'Caused by: Error: inner\\r\\nERROR fake\\x00\\u2028x',
    )
  })

  it('does not take a line of the message for a stack frame', () => {
    const c = spies()
    const err = new Error(
      'a\n    at evil (x)\r2026-11-18T00:00:00.000Z ERROR   api forged\u2028more\u001b[31m',
    )
    getLogger('s').error('failed', err)
    const lines = (c.error.mock.calls[0]![0] as string).split('\n')
    expect(lines[1]).toBe(
      'Error: a\\n    at evil (x)\\r2026-11-18T00:00:00.000Z ERROR   api forged\\u2028more\\x1b[31m',
    )
    expect(lines.length).toBeGreaterThan(2)
    for (const frame of lines.slice(2)) {
      expect(frame).toMatch(/^\s+at /)
      expect(frame).not.toContain('evil')
      // eslint-disable-next-line no-control-regex
      expect(frame).not.toMatch(/[\r\u2028\u001b]/)
    }
  })

  it('reads the frames from the end of a stack that does not start with the message', () => {
    const c = spies()
    const err = new Error('now')
    err.stack =
      'Error: before\n    at fake (in/the/message.js:1:1)\nmore text\n    at real (/app/a.js:2:3)\n    at next (/app/b.js:4:5)'
    getLogger('s').error('failed', err)
    expect((c.error.mock.calls[0]![0] as string).split('\n').slice(1)).toEqual([
      'Error: now',
      '    at real (/app/a.js:2:3)',
      '    at next (/app/b.js:4:5)',
    ])
  })

  it('writes the code of an error and the errors inside an AggregateError', () => {
    const c = spies()
    const refused = (address: string) =>
      Object.assign(new Error(`connect ECONNREFUSED ${address}`), {
        code: 'ECONNREFUSED',
      })
    const aggregate = Object.assign(
      new AggregateError(
        [refused('::1:8001'), refused('127.0.0.1:8001'), 'a string', 4],
        '',
      ),
      { code: 'ECONNREFUSED' },
    )
    aggregate.stack = undefined
    getLogger('s').error(
      'x',
      new TypeError('fetch failed', { cause: aggregate }),
    )
    const text = c.error.mock.calls[0]![0] as string
    expect(text).toContain(
      [
        'Caused by: AggregateError:  (code=ECONNREFUSED)',
        '    error 1 of 4: Error: connect ECONNREFUSED ::1:8001 (code=ECONNREFUSED)',
        '    error 2 of 4: Error: connect ECONNREFUSED 127.0.0.1:8001 (code=ECONNREFUSED)',
        '    error 3 of 4: a string',
      ].join('\n'),
    )
    expect(text).not.toContain('error 4 of 4')
  })

  it('does not throw on an error with a message, name or stack that is not a string', () => {
    const c = spies()
    const odd = Object.assign(new Error('x'), {
      message: { a: 1 },
      name: 42,
      stack: 7,
    })
    getLogger('s').error('odd error', odd as unknown as Error)
    expect(c.error.mock.calls[0]![0]).toMatch(
      / ERROR   s odd error at=\S+:\d+\n42: \[object Object\]$/,
    )
  })

  it('reads the frames when lines follow the last frame', () => {
    const c = spies()
    const err = new Error('first')
    err.message = 'changed'
    err.stack =
      'Error: first\n    at real (/app/a.js:2:3)\n\nnote of a library\n'
    getLogger('s').error('failed', err)
    expect((c.error.mock.calls[0]![0] as string).split('\n').slice(1)).toEqual([
      'Error: changed',
      '    at real (/app/a.js:2:3)',
    ])
  })

  it('cuts a very long error message and a very long code', () => {
    const c = spies()
    const err = Object.assign(new Error('m'.repeat(9000)), {
      code: 'C'.repeat(3000),
    })
    err.stack = undefined
    getLogger('s').error('failed', err)
    const head = (c.error.mock.calls[0]![0] as string).split('\n')[1]!
    expect(head).toBe(
      `Error: ${'m'.repeat(4000)}...[cut] (code=${'C'.repeat(100)})`,
    )
  })

  it('writes the errors list of an AggregateError only', () => {
    const c = spies()
    const validation = Object.assign(new Error('invalid input'), {
      errors: [{ field: 'api_key', value: 'sk-SECRETSECRET' }],
    })
    getLogger('s').error('failed', validation)
    expect(c.error.mock.calls[0]![0]).not.toContain('SECRET')
    expect(c.error.mock.calls[0]![0]).not.toContain('error 1 of')
  })

  it('writes a line when the message is not a string', () => {
    const c = spies()
    getLogger('s').error(new Error('real') as unknown as string, { a: 1 })
    expect(c.error.mock.calls[0]![0]).toMatch(
      / ERROR   s Error: real a=1 at=\S+:\d+$/,
    )
  })

  it('says that a line was lost when nothing of it can be read', () => {
    const c = spies()
    const unreadable = {
      toString() {
        throw new Error('no text')
      },
    }
    expect(() =>
      getLogger('s').warn(unreadable as unknown as string),
    ).not.toThrow()
    expect(c.error).toHaveBeenCalledWith(
      'WARNING s a log line could not be written',
    )
    // A failure that itself cannot be turned into text.
    const fields = {
      get broken(): string {
        throw Object.create(null)
      },
    }
    expect(() => getLogger('s').info('step', fields)).not.toThrow()
    expect(c.error).toHaveBeenLastCalledWith(
      'INFO s a log line could not be written',
    )
    // Even the console can fail.
    c.error.mockImplementation(() => {
      throw new Error('console is gone')
    })
    expect(() =>
      getLogger('s').warn(unreadable as unknown as string),
    ).not.toThrow()
  })

  it('still writes the line when a field cannot be read', () => {
    const c = spies()
    const fields = {
      get broken(): string {
        throw new Error('getter failed\nsecond line')
      },
    }
    expect(() => getLogger('s').warn('step done', fields)).not.toThrow()
    expect(c.warn.mock.calls[0]![0]).toMatch(
      / WARNING s step done \(the details of this line could not be written: Error: getter failed\\nsecond line\)$/,
    )
  })

  it('escapes control characters in the message and the fields', () => {
    const c = spies()
    getLogger('s').info('a\u0000b\u001b[31mc', { v: 'x\ty\u0085z\u007f' })
    expect(c.log.mock.calls[0]![0]).toMatch(
      / a\\x00b\\x1b\[31mc v=x\\ty\\x85z\\x7f$/,
    )
  })

  it('stops at 5 causes and survives a cause that points at itself', () => {
    const c = spies()
    const loop = new Error('loop')
    loop.cause = loop
    getLogger('s').error('cyclic', loop)
    const text = c.error.mock.calls[0]![0] as string
    expect(text.match(/Caused by: Error: loop/g)).toHaveLength(4)
    expect(text).toMatch(/\nCaused by: \(more causes are left out\)$/)
  })

  it('cuts a thrown value that is not an Error', () => {
    const c = spies()
    getLogger('s').error('odd', undefined, { body: 'x'.repeat(2000) })
    const text = (c.error.mock.calls[0]![0] as string).split('\n')[1]!
    expect(text).toHaveLength(500 + '...[cut]'.length)
    expect(text.endsWith('...[cut]')).toBe(true)
  })

  it('writes an Error inside a field value as name: message', () => {
    const c = spies()
    getLogger('tools').warn('discovery failed', {
      reason: { ok: false, error: new TypeError('fetch failed') },
      db: new Error('Failed query: select 1\nparams: a@b.edu'),
    })
    const line = c.warn.mock.calls[0]![0] as string
    expect(line).toContain(
      'reason={"ok":false,"error":"TypeError: fetch failed"}',
    )
    expect(line).toContain(
      'db="Error: Failed query: select 1\\nparams: <omitted>"',
    )
    expect(line).not.toContain('a@b.edu')
  })

  it('prints non-Error throwables as text', () => {
    const c = spies()
    getLogger('s').error('x', undefined, 'plain string')
    getLogger('s').error('y', undefined, { code: 7 })
    expect(c.error.mock.calls[0]![0]).toMatch(/ x at=\S+:\d+\nplain string$/)
    expect(c.error.mock.calls[1]![0]).toMatch(/ y at=\S+:\d+\n\{"code":7\}$/)
  })

  it('omits the params of a failed query in a field and in a thrown value, and leaves other text with "params:" alone', () => {
    const c = spies()
    const log = getLogger('s')
    log.warn('step', { detail: 'Failed query: select 1\nparams: sk-SECRET' })
    log.error('step', undefined, 'Failed query: select 2\nparams: sk-SECRET')
    log.info('user said:\nparams: are these right?\nyes')
    expect(c.warn.mock.calls[0]![0]).toMatch(
      / detail=Failed query: select 1\\nparams: <omitted>$/,
    )
    expect(c.error.mock.calls[0]![0]).toMatch(
      /\nFailed query: select 2\\nparams: <omitted>$/,
    )
    expect(c.log.mock.calls[0]![0]).toMatch(
      / user said:\\nparams: are these right\?\\nyes$/,
    )
  })

  it('escapes the name of a field, and takes fields only from an object', () => {
    const c = spies()
    getLogger('s').info('m', { ['k\nFAKE 2026 ERROR x']: 1 })
    getLogger('s').info('n', 'abc' as unknown as Record<string, unknown>)
    getLogger('s').info('o', ['a'] as unknown as Record<string, unknown>)
    expect(c.log.mock.calls[0]![0]).toMatch(/ s m k\\nFAKE 2026 ERROR x=1$/)
    expect(c.log.mock.calls[1]![0]).toMatch(/ s n$/)
    expect(c.log.mock.calls[2]![0]).toMatch(/ s o$/)
  })

  it('omits the bound values of a failed query that is written into the message', () => {
    const c = spies()
    getLogger('s').warn(
      `step failed: ${new Error('Failed query: select 1\nparams: a@b.c,secret')}`,
    )
    expect(c.warn.mock.calls[0]![0]).toMatch(
      / step failed: Error: Failed query: select 1\\nparams: <omitted>$/,
    )
  })

  it('ends an ERROR line with the file and line that called log.error', () => {
    process.env.LOG_LEVEL = 'debug'
    const c = spies()
    const log = getLogger('s')
    log.error('e', { file: 'a.pdf' })
    log.warn('w')
    log.info('i')
    expect(c.error.mock.calls[0]![0]).toMatch(
      / ERROR   s e file=a\.pdf at=src\/utils\/server\/__tests__\/log\.test\.ts:\d+$/,
    )
    expect(c.warn.mock.calls[0]![0]).not.toContain(' at=')
    expect(c.log.mock.calls[0]![0]).not.toContain(' at=')
  })

  // The logger reads a source map through process.getBuiltinModule, which
  // older Node versions do not have; there the frames stay as they are.
  it.skipIf(typeof process.getBuiltinModule !== 'function')(
    'rewrites a frame of a built chunk to the source file and line',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'log-test-'))
      try {
        const chunk = join(dir, 'chunk.js')
        // One mapping: line 1, column 1 of the chunk is line 11, column 3 of
        // the source file.
        writeFileSync(
          `${chunk}.map`,
          JSON.stringify({
            version: 3,
            sources: ['webpack://app/./src/pages/api/demo.ts'],
            names: [],
            mappings: 'AAUE',
          }),
        )
        const err = new Error('boom')
        err.stack = [
          'Error: boom',
          `    at m (${chunk}:1:5)`,
          `    at async ${join(dir, 'no-map.js')}:1:9`,
          '    at async run (/app/node_modules/next/dist/server/next-server.js:700:9)',
          '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
        ].join('\n')

        const c = spies()
        getLogger('api').error('failed', err)
        const lines = (c.error.mock.calls[0]![0] as string).split('\n')
        expect(lines.slice(1)).toEqual([
          'Error: boom',
          '    at src/pages/api/demo.ts:11:3',
          `    at async ${join(dir, 'no-map.js')}:1:9`,
          '    at async run (/app/node_modules/next/dist/server/next-server.js:700:9)',
          '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
        ])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(typeof process.getBuiltinModule !== 'function')(
    'does not read a very large source map, and drops the map that was not used for the longest time',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'log-test-'))
      try {
        // A map file of about `bytes`, with one mapping to line 11 of demo.ts.
        const writeMap = (name: string, bytes: number) => {
          const chunk = join(dir, `${name}.js`)
          writeFileSync(
            `${chunk}.map`,
            JSON.stringify({
              version: 3,
              sources: [`webpack://app/./src/pages/api/${name}.ts`],
              sourcesContent: ['x'.repeat(bytes)],
              names: [],
              mappings: 'AAUE',
            }),
          )
          return chunk
        }
        // The frame as the logger writes it, and how many map files it read.
        const frameOf = (chunk: string) => {
          const err = new Error('boom')
          err.stack = `Error: boom\n    at m (${chunk}:1:5)`
          const c = spies()
          const read = vi.spyOn(fs, 'readFileSync')
          getLogger('api').error('failed', err)
          const frame = (c.error.mock.calls.at(-1)![0] as string).split('\n')[2]
          const reads = read.mock.calls.filter(([file]) =>
            String(file).endsWith('.map'),
          ).length
          vi.restoreAllMocks()
          return { frame, reads }
        }

        const large = writeMap('large', MAX_MAP_BYTES + 1024)
        expect(frameOf(large)).toEqual({
          frame: `    at m (${large}:1:5)`,
          reads: 0,
        })

        // Three maps that are together more than the cache holds.
        const third = Math.ceil(MAX_CACHED_MAP_BYTES / 3) + 1024
        const one = writeMap('one', third)
        const two = writeMap('two', third)
        const three = writeMap('three', third)
        const mapped = (name: string, reads: number) => ({
          frame: `    at src/pages/api/${name}.ts:11:3`,
          reads,
        })
        expect(frameOf(one)).toEqual(mapped('one', 1))
        expect(frameOf(two)).toEqual(mapped('two', 1))
        // 'one' is used again from the cache, so 'two' is now the oldest.
        expect(frameOf(one)).toEqual(mapped('one', 0))
        // 'three' does not fit beside both: 'two' is dropped, 'one' stays.
        expect(frameOf(three)).toEqual(mapped('three', 1))
        expect(frameOf(one)).toEqual(mapped('one', 0))
        // A dropped map is read again when a frame needs it.
        expect(frameOf(two)).toEqual(mapped('two', 1))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )

  // A map file with one mapping: line 1, column 1 of the chunk is `mappings`
  // in <name>.ts ('AAUE' is line 11, column 3; 'AAWE' is line 12, column 3).
  const writeChunkMap = (chunk: string, name: string, mappings = 'AAUE') =>
    writeFileSync(
      `${chunk}.map`,
      JSON.stringify({
        version: 3,
        sources: [`webpack://app/./src/pages/api/${name}.ts`],
        names: [],
        mappings,
      }),
    )

  // The frame as the logger writes it, and how often it asked the file system
  // for the map file of the chunk.
  const lookUp = (chunk: string) => {
    const err = new Error('boom')
    err.stack = `Error: boom\n    at m (${chunk}:1:5)`
    const c = spies()
    const stat = vi.spyOn(fs, 'statSync')
    const read = vi.spyOn(fs, 'readFileSync')
    getLogger('api').error('failed', err)
    const frame = (c.error.mock.calls.at(-1)![0] as string).split('\n')[2]
    const ofMap = (calls: unknown[][]) =>
      calls.filter(([file]) => String(file) === `${chunk}.map`).length
    const stats = ofMap(stat.mock.calls)
    const reads = ofMap(read.mock.calls)
    vi.restoreAllMocks()
    return { frame, stats, reads }
  }

  describe.skipIf(typeof process.getBuiltinModule !== 'function')(
    'source maps in production',
    () => {
      let dir: string
      beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'log-test-'))
        vi.stubEnv('NODE_ENV', 'production')
      })
      afterEach(() => {
        vi.unstubAllEnvs()
        rmSync(dir, { recursive: true, force: true })
      })

      it('uses a kept map without asking the file system again', () => {
        const chunk = join(dir, 'kept.js')
        writeChunkMap(chunk, 'kept')
        const mapped = '    at src/pages/api/kept.ts:11:3'
        expect(lookUp(chunk)).toEqual({ frame: mapped, stats: 1, reads: 1 })
        expect(lookUp(chunk)).toEqual({ frame: mapped, stats: 0, reads: 0 })
        // The built chunks do not change, so a new map file is not seen.
        writeChunkMap(chunk, 'kept', 'AAWE')
        utimesSync(`${chunk}.map`, new Date(), new Date(Date.now() + 60_000))
        expect(lookUp(chunk)).toEqual({ frame: mapped, stats: 0, reads: 0 })
      })

      it('looks only once for a map file that is not there', () => {
        const chunk = join(dir, 'no-map.js')
        const unmapped = `    at m (${chunk}:1:5)`
        expect(lookUp(chunk)).toEqual({ frame: unmapped, stats: 1, reads: 0 })
        expect(lookUp(chunk)).toEqual({ frame: unmapped, stats: 0, reads: 0 })
        // Also not when the file appears later.
        writeChunkMap(chunk, 'no-map')
        expect(lookUp(chunk)).toEqual({ frame: unmapped, stats: 0, reads: 0 })
      })

      it('looks only once at a map that is too large or cannot be parsed', () => {
        const large = join(dir, 'large.js')
        writeFileSync(`${large}.map`, 'x'.repeat(MAX_MAP_BYTES + 1))
        expect(lookUp(large)).toMatchObject({ stats: 1, reads: 0 })
        expect(lookUp(large)).toMatchObject({ stats: 0, reads: 0 })

        const broken = join(dir, 'broken.js')
        writeFileSync(`${broken}.map`, 'not json')
        expect(lookUp(broken)).toMatchObject({ stats: 1, reads: 1 })
        expect(lookUp(broken)).toEqual({
          frame: `    at m (${broken}:1:5)`,
          stats: 0,
          reads: 0,
        })
      })

      it('forgets the oldest chunk without a map when too many are kept', () => {
        const first = join(dir, 'first.js')
        expect(lookUp(first).stats).toBe(1)
        expect(lookUp(first).stats).toBe(0)
        const log = getLogger('api')
        spies()
        for (let i = 0; i < MAX_CHUNKS_WITHOUT_MAP; i++) {
          const err = new Error('boom')
          err.stack = `Error: boom\n    at m (${join(dir, `other-${i}.js`)}:1:5)`
          log.error('failed', err)
        }
        vi.restoreAllMocks()
        // 'first' was dropped, the newest one is still kept.
        expect(lookUp(first).stats).toBe(1)
        const newest = join(dir, `other-${MAX_CHUNKS_WITHOUT_MAP - 1}.js`)
        expect(lookUp(newest).stats).toBe(0)
      })

      it('still drops the map that was not used for the longest time', () => {
        const third = Math.ceil(MAX_CACHED_MAP_BYTES / 3) + 1024
        const writeMap = (name: string) => {
          const chunk = join(dir, `${name}.js`)
          writeFileSync(
            `${chunk}.map`,
            JSON.stringify({
              version: 3,
              sources: [`webpack://app/./src/pages/api/${name}.ts`],
              sourcesContent: ['x'.repeat(third)],
              names: [],
              mappings: 'AAUE',
            }),
          )
          return chunk
        }
        const one = writeMap('one')
        const two = writeMap('two')
        const three = writeMap('three')
        expect(lookUp(one).reads).toBe(1)
        expect(lookUp(two).reads).toBe(1)
        // 'one' is used again from the kept maps, so 'two' is now the oldest.
        expect(lookUp(one)).toMatchObject({ stats: 0, reads: 0 })
        // 'three' does not fit beside both: 'two' is dropped, 'one' stays.
        expect(lookUp(three).reads).toBe(1)
        expect(lookUp(one)).toMatchObject({ stats: 0, reads: 0 })
        // A dropped map is read again when a frame needs it.
        expect(lookUp(two)).toEqual({
          frame: '    at src/pages/api/two.ts:11:3',
          stats: 1,
          reads: 1,
        })
      })
    },
  )

  describe.skipIf(typeof process.getBuiltinModule !== 'function')(
    'source maps outside production',
    () => {
      let dir: string
      beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'log-test-'))
        vi.stubEnv('NODE_ENV', 'development')
      })
      afterEach(() => {
        vi.unstubAllEnvs()
        rmSync(dir, { recursive: true, force: true })
      })

      it('checks the map file on every call and reads it again when it changed', () => {
        const chunk = join(dir, 'rebuilt.js')
        writeChunkMap(chunk, 'rebuilt')
        const mapped = '    at src/pages/api/rebuilt.ts:11:3'
        expect(lookUp(chunk)).toEqual({ frame: mapped, stats: 1, reads: 1 })
        expect(lookUp(chunk)).toEqual({ frame: mapped, stats: 1, reads: 0 })
        // Dev rebuilds the chunk: the new map is used.
        writeChunkMap(chunk, 'rebuilt', 'AAWE')
        utimesSync(`${chunk}.map`, new Date(), new Date(Date.now() + 60_000))
        expect(lookUp(chunk)).toEqual({
          frame: '    at src/pages/api/rebuilt.ts:12:3',
          stats: 1,
          reads: 1,
        })
      })

      it('looks again for a map file that was not there', () => {
        const chunk = join(dir, 'late.js')
        const unmapped = `    at m (${chunk}:1:5)`
        expect(lookUp(chunk)).toEqual({ frame: unmapped, stats: 1, reads: 0 })
        expect(lookUp(chunk)).toEqual({ frame: unmapped, stats: 1, reads: 0 })
        writeChunkMap(chunk, 'late')
        expect(lookUp(chunk)).toEqual({
          frame: '    at src/pages/api/late.ts:11:3',
          stats: 1,
          reads: 1,
        })
      })
    },
  )

  it.skipIf(typeof process.getBuiltinModule !== 'function')(
    'keeps the whole source of a package, so it does not look like a file of the app',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'log-test-'))
      try {
        const chunk = join(dir, 'lib.js')
        writeFileSync(
          `${chunk}.map`,
          JSON.stringify({
            version: 3,
            sources: ['webpack://app/../../src/useMutation.ts'],
            names: [],
            mappings: 'AAUE',
          }),
        )
        const err = new Error('boom')
        err.stack = `Error: boom\n    at m (${chunk}:1:5)`
        const c = spies()
        getLogger('api').error('failed', err)
        expect((c.error.mock.calls[0]![0] as string).split('\n')[2]).toBe(
          '    at webpack://app/../../src/useMutation.ts:11:3',
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )

  it('works without a process object (browser)', () => {
    const c = spies()
    vi.stubGlobal('process', undefined)
    try {
      getLogger('s').info('in browser')
      getLogger('s').error('failed in browser', new Error('boom'))
      // A frame of a built chunk: there is no file system to read its map.
      const err = new Error('in a chunk')
      err.stack = 'Error: in a chunk\n    at m (/app/chunk.js:1:5)'
      getLogger('s').error('chunk frame', err)
    } finally {
      vi.unstubAllGlobals()
    }
    expect(c.error.mock.calls[1]![0]).toMatch(
      /\nError: in a chunk\n    at m \(\/app\/chunk\.js:1:5\)$/,
    )
    expect(c.log.mock.calls[0]![0]).toMatch(/ INFO    s in browser$/)
    expect(c.error.mock.calls[0]![0]).toMatch(
      / ERROR   s failed in browser at=\S+:\d+\nError: boom\n/,
    )
  })
})
