/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'
import { runAppRoute, runPagesRoute } from '../routeContext'
import {
  MetadataUnavailableError,
  getLogContext,
  runWithLogContext,
} from '../requestContext'

function quiet() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('runPagesRoute', () => {
  it('reads X-Request-ID, sets the response header first and opens the context', async () => {
    const req = createMockReq({
      url: '/api/thing?course_name=x',
      headers: { 'x-request-id': 'abc123' },
    })
    const res = createMockRes()
    let seen: unknown
    await runPagesRoute(req, res, () => {
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'abc123')
      seen = getLogContext()
    })
    expect(seen).toEqual({ rid: 'abc123', path: '/api/thing' })
  })

  it('mints an id and writes it back onto the request', async () => {
    const req = createMockReq({ headers: {} })
    const res = createMockRes()
    await runPagesRoute(req, res, () => undefined)
    const rid = req.headers['x-request-id']
    expect(rid).toMatch(/^[0-9a-f]{12}$/)
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', rid)
  })

  it('turns a thrown error into one ERROR line and a 500', async () => {
    const error = quiet()
    const res = createMockRes()
    await runPagesRoute(createMockReq({ url: '/api/boom' }), res, () => {
      throw new Error('kaput')
    })
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Internal server error' }),
    )
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]![0]).toMatch(
      / ERROR   api rid=\S+ path=\/api\/boom unhandled error in API route\nError: kaput\n/,
    )
  })

  it('answers 503 when the project metadata store is down', async () => {
    const error = quiet()
    const res = createMockRes()
    await runPagesRoute(createMockReq({ url: '/api/x' }), res, () => {
      throw new MetadataUnavailableError('ece120', new Error('ECONNREFUSED'))
    })
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Project metadata store unavailable' }),
    )
    expect(error.mock.calls[0]![0]).toMatch(
      /project metadata store unavailable\nMetadataUnavailableError: .*ece120/,
    )
    expect(error.mock.calls[0]![0]).toContain('Caused by: Error: ECONNREFUSED')
  })

  it('only ends the response when the handler already sent headers', async () => {
    quiet()
    const res = createMockRes()
    res.headersSent = true
    await runPagesRoute(createMockReq(), res, () => {
      throw new Error('late')
    })
    expect(res.end).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('reuses an open context without touching headers', async () => {
    const req = createMockReq({ headers: {} })
    const res = createMockRes()
    let seen: unknown
    await runWithLogContext({ rid: 'outer', course: 'ece120' }, () =>
      runPagesRoute(req, res, () => {
        seen = getLogContext()
      }),
    )
    expect(seen).toEqual({ rid: 'outer', course: 'ece120' })
    expect(res.setHeader).not.toHaveBeenCalled()
    expect(req.headers['x-request-id']).toBeUndefined()
  })
})

describe('runAppRoute', () => {
  function appReq(headers: Headers = new Headers()) {
    return {
      headers,
      nextUrl: { pathname: '/api/chat' },
    } as any
  }

  it('reads the id, opens the context and sets the response header', async () => {
    let seen: unknown
    const res = await runAppRoute(
      appReq(new Headers({ 'x-request-id': 'app1' })),
      () => {
        seen = getLogContext()
        return NextResponse.json({ ok: true })
      },
    )
    expect(seen).toEqual({ rid: 'app1', path: '/api/chat' })
    expect(res.headers.get('X-Request-ID')).toBe('app1')
  })

  it('mints an id and writes it onto the request headers', async () => {
    const req = appReq()
    const res = await runAppRoute(req, () => NextResponse.json({}))
    const rid = req.headers.get('x-request-id')
    expect(rid).toMatch(/^[0-9a-f]{12}$/)
    expect(res.headers.get('X-Request-ID')).toBe(rid)
  })

  it('tolerates read-only request headers and immutable response headers', async () => {
    const readOnly = {
      get: () => null,
      set: () => {
        throw new TypeError('immutable')
      },
    }
    const redirect = Response.redirect('http://localhost/next', 302)
    const res = await runAppRoute(
      appReq(readOnly as any),
      () => redirect as unknown as NextResponse,
    )
    expect(res).toBe(redirect)
    expect(res.status).toBe(302)
  })

  it('turns a thrown error into a 500 with the id header', async () => {
    const error = quiet()
    const res = await runAppRoute(
      appReq(new Headers({ 'x-request-id': 'r9' })),
      () => {
        throw new Error('kaput')
      },
    )
    expect(res.status).toBe(500)
    expect(res.headers.get('X-Request-ID')).toBe('r9')
    await expect(res.json()).resolves.toMatchObject({
      error: 'Internal server error',
    })
    expect(error.mock.calls[0]![0]).toMatch(
      / ERROR   api rid=r9 path=\/api\/chat unhandled error in API route\nError: kaput/,
    )
  })

  it('answers 503 on MetadataUnavailableError', async () => {
    quiet()
    const res = await runAppRoute(appReq(), async () => {
      throw new MetadataUnavailableError('ece120', new Error('down'))
    })
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Project metadata store unavailable',
    })
  })

  it('reuses an open context and still sets the response header', async () => {
    const req = appReq()
    let seen: unknown
    const res = await runWithLogContext({ rid: 'outer', course: 'c' }, () =>
      runAppRoute(req, () => {
        seen = getLogContext()
        return NextResponse.json({})
      }),
    )
    expect(seen).toEqual({ rid: 'outer', course: 'c' })
    expect(res.headers.get('X-Request-ID')).toBe('outer')
    expect(req.headers.get('x-request-id')).toBeNull()
  })
})
