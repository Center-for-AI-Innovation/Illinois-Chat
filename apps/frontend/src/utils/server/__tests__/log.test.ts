/* @vitest-environment node */

import fs, { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CACHED_MAP_BYTES,
  MAX_MAP_BYTES,
  cutForLog,
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

  it('hides the password of a URL in the message, the fields and the error', () => {
    const c = spies()
    const err = new Error(
      'connect failed for postgres://app:hunter2@db.internal:5432/public',
      { cause: new Error('auth failed redis://default:s3cret@redis:6379') },
    )
    getLogger('db').error(
      'cannot reach amqp://guest:guest@rabbit:5672/',
      {
        url: 'https://user:pa55@example.edu/path?x=1',
        plain: 'https://a.edu/b',
      },
      err,
    )
    const line = c.error.mock.calls[0]![0] as string
    expect(line).toContain('cannot reach amqp://***@rabbit:5672/')
    expect(line).toContain('url=https://***@example.edu/path?x=1')
    expect(line).toContain('plain=https://a.edu/b')
    expect(line).toContain('postgres://***@db.internal:5432/public')
    expect(line).toContain(
      'Caused by: Error: auth failed redis://***@redis:6379',
    )
    for (const secret of ['hunter2', 's3cret', 'guest:guest', 'pa55']) {
      expect(line).not.toContain(secret)
    }
  })

  it('hides a login with no user, a token as the user and a password with an @', () => {
    const c = spies()
    getLogger('s').info('urls', {
      a: 'redis://:onlypass@host:6379/0',
      b: 'https://token123@github.com/x',
      c: 'postgres://user:p@ss@db/public',
    })
    expect(c.log.mock.calls[0]![0]).toMatch(
      / a=redis:\/\/\*\*\*@host:6379\/0 b=https:\/\/\*\*\*@github\.com\/x c=postgres:\/\/\*\*\*@db\/public$/,
    )
  })

  it('hides a password that has punctuation in it', () => {
    const c = spies()
    const urls = [
      'postgres://user:p,ss@db.internal/x',
      'redis://:p?ss@cache:6379',
      'redis://:p#ss@cache:6379',
      "amqp://guest:gu'est@mq",
      'https://user:p<a>ss@h',
      'postgres://admin:2024#Winter@db.internal:5432/app',
      'https://u:8443@h/x',
    ]
    getLogger('s').info(urls.join(' '))
    const line = c.log.mock.calls[0]![0] as string
    expect(line).toMatch(
      / postgres:\/\/\*\*\*@db\.internal\/x redis:\/\/\*\*\*@cache:6379 redis:\/\/\*\*\*@cache:6379 amqp:\/\/\*\*\*@mq https:\/\/\*\*\*@h postgres:\/\/\*\*\*@db\.internal:5432\/app https:\/\/\*\*\*@h\/x$/,
    )
  })

  it('hides a login whose user name has an @ or punctuation in it', () => {
    const c = spies()
    const urls = [
      'smtp://rashmil@example.com:Sup3rSecret@smtp.example.com:587',
      'postgres://admin@myserver:S3cret@myserver.postgres.database.azure.com:5432/db',
      'imap://a@b.edu:pw@mail',
      'http://CORP\\svc:S3cret@proxy:8080',
      'http://us,er:pw@host',
      'http://u&x:secret@h',
      'http://user:123,x@host/',
    ]
    getLogger('s').info(urls.join(' '))
    expect(c.log.mock.calls[0]![0]).toMatch(
      / smtp:\/\/\*\*\*@smtp\.example\.com:587 postgres:\/\/\*\*\*@myserver\.postgres\.database\.azure\.com:5432\/db imap:\/\/\*\*\*@mail http:\/\/\*\*\*@proxy:8080 http:\/\/\*\*\*@host http:\/\/\*\*\*@h http:\/\/\*\*\*@host\/$/,
    )
  })

  it('hides a password that starts with digits, and a login after more than two slashes', () => {
    const c = spies()
    getLogger('s').info(
      'redis://default:1234&abcd@cache.internal:6379 mongodb://root:99?x@mongo postgres://user:1#x@h http:///user:SECRETB@127.0.0.1:9/',
    )
    // Backslashes count as slashes for a browser.
    getLogger('s').info(
      'http://\\/user:SECRETA@host/ http:\\\\user:SECRETA@host/',
    )
    expect(c.log.mock.calls[1]![0]).toMatch(
      / s http:\/\/\*\*\*@host\/ http:\/\/\*\*\*@host\/$/,
    )
    expect(c.log.mock.calls[0]![0]).toMatch(
      / redis:\/\/\*\*\*@cache\.internal:6379 mongodb:\/\/\*\*\*@mongo postgres:\/\/\*\*\*@h http:\/\/\*\*\*@127\.0\.0\.1:9\/$/,
    )
  })

  it('leaves a URL in JSON, a URL with a path, and a URL before a newline alone', () => {
    const c = spies()
    getLogger('s').info('reply', {
      body: { url: 'http://backend:8001', email: 'alice@illinois.edu' },
      page: 'https://site.edu/login?email=bob@x.edu',
    })
    // The login is looked for before a newline is escaped, so a newline ends
    // the URL.
    getLogger('s').info('http://backend:8001\nbob@c.edu')
    expect(c.log.mock.calls[0]![0]).toMatch(
      / body=\{"url":"http:\/\/backend:8001","email":"alice@illinois\.edu"\} page=https:\/\/site\.edu\/login\?email=bob@x\.edu$/,
    )
    expect(c.log.mock.calls[1]![0]).toContain(
      ' s http://backend:8001\\nbob@c.edu',
    )
  })

  it('takes away the text between a URL with no path and a later @', () => {
    // The price of a rule that does not show a password. No secret is in
    // these lines.
    const c = spies()
    const log = getLogger('s')
    log.info('https://a.edu?email=x@y.edu')
    log.info('redirect_uri=http://localhost:3000&login_hint=alice@illinois.edu')
    log.info('see https://a.edu:8443,contact:bob@y.edu')
    expect(c.log.mock.calls[0]![0]).toContain(' s https://***@y.edu')
    expect(c.log.mock.calls[1]![0]).toContain(
      ' s redirect_uri=http://***@illinois.edu',
    )
    expect(c.log.mock.calls[2]![0]).toContain(' s see https://***@y.edu')
  })

  it('hides the login before a long error message is cut', () => {
    const c = spies()
    const err = new Error(
      `${'x'.repeat(3985)} postgres://user:SECRETPASS@host/db and more text`,
    )
    err.stack = undefined
    getLogger('s').error('failed', err)
    const text = c.error.mock.calls[0]![0] as string
    expect(text).not.toMatch(/SECRET|user:/)
    expect(text).toMatch(/ postgres:\/\/\*\*\*\S*\.\.\.\[cut\]$/)
  })

  it('cutForLog hides a login before it cuts', () => {
    const text = `${'x'.repeat(480)} postgres://admin:SuperSecretPw@db.internal/app and more`
    expect(cutForLog(text)).toHaveLength(500)
    expect(cutForLog(text)).not.toMatch(/admin|Super/)
    expect(cutForLog(text).endsWith(' postgres://***@db.i')).toBe(true)
    expect(cutForLog('short', 3)).toBe('sho')
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

  it('hides a login in the code of an error before the code is cut', () => {
    const c = spies()
    const err = Object.assign(new Error('x'), {
      code: `${'c'.repeat(80)} redis://:SuperSecretPassword@h`,
    })
    err.stack = undefined
    getLogger('s').error('failed', err)
    expect(c.error.mock.calls[0]![0]).not.toContain('SuperSecre')
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
