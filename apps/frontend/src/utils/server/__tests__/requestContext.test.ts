/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MetadataUnavailableError,
  getLogContext,
  getRequestId,
  runWithLogContext,
  setLogCourse,
} from '../requestContext'

describe('runWithLogContext / getLogContext', () => {
  it('exposes the context inside the callback, across awaits and timers', async () => {
    expect(getLogContext()).toBeUndefined()
    const seen = await runWithLogContext(
      { rid: 'r1', path: '/api/x' },
      async () => {
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 1))
        return getLogContext()
      },
    )
    expect(seen).toEqual({ rid: 'r1', path: '/api/x' })
    expect(getLogContext()).toBeUndefined()
  })

  it('returns the callback result', () => {
    expect(runWithLogContext({ rid: 'r' }, () => 42)).toBe(42)
  })

  it('setLogCourse adds the course to the open context only', () => {
    setLogCourse('outside') // no context: nothing to set, no throw
    expect(getLogContext()).toBeUndefined()
    const ctx = runWithLogContext({ rid: 'r2' }, () => {
      setLogCourse('ece120')
      return getLogContext()
    })
    expect(ctx).toEqual({ rid: 'r2', course: 'ece120' })
  })
})

describe('getRequestId', () => {
  it('reads a valid id from a Pages header object', () => {
    expect(getRequestId({ headers: { 'x-request-id': 'abc_123-XYZ' } })).toBe(
      'abc_123-XYZ',
    )
  })

  it('reads the first value of a repeated Pages header', () => {
    expect(
      getRequestId({ headers: { 'x-request-id': ['first', 'second'] } }),
    ).toBe('first')
  })

  it('reads a valid id from App Headers', () => {
    expect(
      getRequestId({ headers: new Headers({ 'X-Request-ID': 'app1' }) }),
    ).toBe('app1')
  })

  it('mints a 12-character id when the header is missing or unsafe', () => {
    const minted = [
      getRequestId({ headers: {} }),
      getRequestId({}),
      getRequestId({ headers: new Headers() }),
      getRequestId({ headers: { 'x-request-id': 'has space' } }),
      getRequestId({ headers: { 'x-request-id': 'line\nbreak' } }),
      getRequestId({ headers: { 'x-request-id': 'a'.repeat(65) } }),
      getRequestId({ headers: { 'x-request-id': '' } }),
    ]
    for (const id of minted) expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(new Set(minted).size).toBe(minted.length)
  })

  it('accepts an id of exactly 64 characters', () => {
    const id = 'b'.repeat(64)
    expect(getRequestId({ headers: { 'x-request-id': id } })).toBe(id)
  })
})

describe('MetadataUnavailableError', () => {
  it('names the project and keeps the Redis error as the cause', () => {
    const cause = new Error('connect ECONNREFUSED')
    const err = new MetadataUnavailableError('ece120', cause)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('MetadataUnavailableError')
    expect(err.message).toBe('could not read the metadata of project ece120')
    expect(err.cause).toBe(cause)
  })
})

describe('browser fallback (async_hooks stubbed to an empty module)', () => {
  afterEach(() => {
    vi.doUnmock('async_hooks')
    vi.resetModules()
  })

  it('has no store and runs the callback directly', async () => {
    // The browser stub is an empty module, so the named import is undefined.
    // vitest throws on a key missing from a mock, so state it explicitly.
    vi.doMock('async_hooks', () => ({ AsyncLocalStorage: undefined }))
    vi.resetModules()
    const mod = await import('../requestContext')
    expect(mod.getLogContext()).toBeUndefined()
    const result = mod.runWithLogContext({ rid: 'r' }, () => {
      mod.setLogCourse('ece120')
      return mod.getLogContext()
    })
    expect(result).toBeUndefined()
    expect(mod.runWithLogContext({ rid: 'r' }, () => 'ran')).toBe('ran')
  })
})
