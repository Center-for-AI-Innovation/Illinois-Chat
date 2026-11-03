/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backendFetch } from '../backendFetch'
import { runWithLogContext } from '../requestContext'

describe('backendFetch', () => {
  const fetchMock = vi.fn()
  const savedLevel = process.env.LOG_LEVEL

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.LOG_LEVEL
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    if (savedLevel === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = savedLevel
  })

  it('returns an ok response without an ERROR line', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = new Response('fine', { status: 200 })
    fetchMock.mockResolvedValue(ok)

    const res = await backendFetch('http://backend:8001/ingest')

    expect(res).toBe(ok)
    expect(error).not.toHaveBeenCalled()
    // No context, no init: passed through untouched, method defaults to GET.
    expect(fetchMock).toHaveBeenCalledWith('http://backend:8001/ingest', {})
  })

  it('logs a DEBUG line with the duration when LOG_LEVEL=DEBUG', async () => {
    process.env.LOG_LEVEL = 'DEBUG'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await backendFetch('http://backend:8001/getAll?course_name=x', {
      method: 'post',
    })

    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toMatch(
      / DEBUG   backendFetch backend 200 POST \/getAll ms=\d+$/,
    )
  })

  it('logs status, method, path, ms and the first 500 body characters on !ok', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const longBody = 'x'.repeat(600)
    fetchMock.mockResolvedValue(new Response(longBody, { status: 502 }))

    const res = await backendFetch(
      'http://backend:8001/canvas_ingest?token=secret',
      {
        method: 'POST',
      },
    )

    expect(res.status).toBe(502)
    // The caller can still read the body.
    await expect(res.text()).resolves.toBe(longBody)
    expect(error).toHaveBeenCalledTimes(1)
    const line = error.mock.calls[0]![0] as string
    expect(line).toMatch(
      new RegExp(
        ` ERROR   backendFetch backend 502 POST /canvas_ingest ms=\\d+ body=x{500}$`,
      ),
    )
    expect(line).not.toContain('secret')
  })

  it('notes an unreadable body instead of failing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = {
      ok: false,
      status: 500,
      clone: () => ({ text: () => Promise.reject(new Error('stream gone')) }),
    }
    fetchMock.mockResolvedValue(broken)
    const res = await backendFetch('not a url?q=1')
    expect(res).toBe(broken)
    expect(error.mock.calls[0]![0]).toMatch(
      / backend 500 GET not a url ms=\d+ body=<unreadable: stream gone>$/,
    )

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      clone: () => ({ text: () => Promise.reject('nope') }),
    })
    await backendFetch('http://backend/x')
    expect(error.mock.calls[1]![0]).toMatch(/body=<unreadable: nope>$/)
  })

  it('forwards the context request id on plain-object headers', async () => {
    fetchMock.mockResolvedValue(new Response('ok'))
    await runWithLogContext({ rid: 'abc123' }, () =>
      backendFetch('http://backend/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith('http://backend/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'abc123' },
      body: '{}',
    })
  })

  it('forwards the id when there are no headers yet', async () => {
    fetchMock.mockResolvedValue(new Response('ok'))
    await runWithLogContext({ rid: 'r1' }, () =>
      backendFetch('http://backend/x'),
    )
    expect(fetchMock.mock.calls[0]![1]).toEqual({
      headers: { 'X-Request-ID': 'r1' },
    })
  })

  it('forwards the id on Headers and tuple headers', async () => {
    fetchMock.mockResolvedValue(new Response('ok'))
    await runWithLogContext({ rid: 'r2' }, async () => {
      await backendFetch('http://backend/a', {
        headers: new Headers({ A: '1' }),
      })
      await backendFetch('http://backend/b', { headers: [['B', '2']] })
    })
    const first = fetchMock.mock.calls[0]![1].headers as Headers
    const second = fetchMock.mock.calls[1]![1].headers as Headers
    expect(first.get('x-request-id')).toBe('r2')
    expect(first.get('a')).toBe('1')
    expect(second.get('x-request-id')).toBe('r2')
    expect(second.get('b')).toBe('2')
  })

  it('sends no X-Request-ID without a context', async () => {
    fetchMock.mockResolvedValue(new Response('ok'))
    const init = { headers: { A: '1' } }
    await backendFetch('http://backend/x', init)
    expect(fetchMock.mock.calls[0]![1]).toBe(init)
  })
})
