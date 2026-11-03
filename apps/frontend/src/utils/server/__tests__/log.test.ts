/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLogger } from '../log'
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
    expect(c.error.mock.calls[0]![0]).toMatch(/ ERROR   s e$/)
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
    expect(lines[0]).toMatch(/ ERROR   api handler failed status=500$/)
    expect(lines[1]).toBe('TypeError: bad input')
    expect(lines.length).toBeGreaterThan(2)
    for (const frame of lines.slice(2)) expect(frame).toMatch(/^\s+at /)
  })

  it('accepts the error in the fields position', () => {
    const c = spies()
    getLogger('api').error('failed', new Error('boom'))
    const lines = (c.error.mock.calls[0]![0] as string).split('\n')
    expect(lines[0]).toMatch(/ ERROR   api failed$/)
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
      'Caused by: Error: Failed query: insert into "t" ("a") values ($1)\nparams: <omitted>',
    )
    expect(line).not.toContain('a@b.edu')
  })

  it('prints non-Error throwables as text', () => {
    const c = spies()
    getLogger('s').error('x', undefined, 'plain string')
    getLogger('s').error('y', undefined, { code: 7 })
    expect(c.error.mock.calls[0]![0]).toMatch(/ x\nplain string$/)
    expect(c.error.mock.calls[1]![0]).toMatch(/ y\n\{"code":7\}$/)
  })

  it('works without a process object (browser)', () => {
    const c = spies()
    vi.stubGlobal('process', undefined)
    try {
      getLogger('s').info('in browser')
    } finally {
      vi.unstubAllGlobals()
    }
    expect(c.log.mock.calls[0]![0]).toMatch(/ INFO    s in browser$/)
  })
})
