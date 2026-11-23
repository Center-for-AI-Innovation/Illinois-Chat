import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

vi.mock('~/server/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
}))

import handler from '~/pages/api/UIUC-api/ingest'

describe('UIUC-api/ingest', () => {
  it('returns 405 for non-POST', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns 400 when body params are missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: { courseName: 'CS101' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('submits to ingest and returns response body', async () => {
    process.env.INGEST_URL = 'http://ingest/ingest'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ task_id: 't1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          uniqueFileName: 'u',
          courseName: 'CS101',
          readableFilename: 'r.pdf',
          forceEmbeddings: true,
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(fetchSpy).toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('passes a backend error status through with an error field and logs it once', async () => {
    process.env.INGEST_URL = 'http://ingest/ingest'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('<html>Bad Gateway</html>', { status: 502 }),
      )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          uniqueFileName: 'u.pdf',
          courseName: 'CS101',
          readableFilename: 'r.pdf',
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Ingest backend answered with status 502',
    })
    // One ERROR from backendFetch with the status, path and body.
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*backend 502 POST \/ingest .*body=<html>Bad Gateway<\/html>/,
      ),
    )
    // The route adds the file it could not queue.
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringMatching(
        /WARNING api\.ingest .*ingest not queued upstream_status=502 file=courses\/CS101\/u\.pdf/,
      ),
    )
    fetchSpy.mockRestore()
    consoleError.mockRestore()
    consoleWarn.mockRestore()
  })

  // A 401 or 403 from the backend is about the key between our services. The
  // browser must not read it as "you are not signed in".
  it.each([401, 403])(
    'answers 502 when the backend refuses the request with %i',
    async (upstream) => {
      process.env.INGEST_URL = 'http://ingest/ingest'
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('denied', { status: upstream }))
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const res = createMockRes()
      await handler(
        createMockReq({
          method: 'POST',
          body: {
            uniqueFileName: 'u.pdf',
            courseName: 'CS101',
            readableFilename: 'r.pdf',
          },
        }) as any,
        res as any,
      )

      expect(res.status).toHaveBeenCalledTimes(1)
      expect(res.status).toHaveBeenCalledWith(502)
      expect(res.json).toHaveBeenCalledWith({
        error: `Ingest backend refused the request (status ${upstream})`,
      })
      // The log lines keep the status that the backend gave.
      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`ERROR .*backend ${upstream} POST /ingest `),
        ),
      )
      expect(consoleWarn).toHaveBeenCalledTimes(1)
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `WARNING api\\.ingest .*ingest not queued upstream_status=${upstream} file=courses/CS101/u\\.pdf`,
          ),
        ),
      )
      fetchSpy.mockRestore()
      consoleError.mockRestore()
      consoleWarn.mockRestore()
    },
  )

  it('passes a backend 500 through as 500', async () => {
    process.env.INGEST_URL = 'http://ingest/ingest'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          uniqueFileName: 'u.pdf',
          courseName: 'CS101',
          readableFilename: 'r.pdf',
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Ingest backend answered with status 500',
    })
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringMatching(/ingest not queued upstream_status=500 /),
    )
    fetchSpy.mockRestore()
    consoleError.mockRestore()
    consoleWarn.mockRestore()
  })

  it('returns 500 and logs when the ingest call throws', async () => {
    process.env.INGEST_URL = 'http://ingest/ingest'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          uniqueFileName: 'u.pdf',
          courseName: 'CS101',
          readableFilename: 'r.pdf',
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(500)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*ingest submission failed file=u\.pdf at=\S+:\d+\nError: connect ECONNREFUSED/,
      ),
    )
    fetchSpy.mockRestore()
    consoleError.mockRestore()
  })
})
