import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

vi.mock('~/server/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
}))

vi.mock('~/utils/apiUtils', () => ({
  getBackendUrl: () => 'http://backend',
}))

import handler from '~/pages/api/UIUC-api/ingestCanvas'

describe('UIUC-api/ingestCanvas', () => {
  it('returns 405 for non-POST', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns 400 when required body params are missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: { courseName: 'CS101' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('sends email, calls canvas ingest, and returns backend status', async () => {
    process.env.INGEST_URL = 'http://ingest/ingest'

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('email', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ task_id: 't1' }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
      )

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          courseName: 'CS101',
          canvas_url: 'http://canvas',
          selectedCanvasOptions: ['files', 'pages'],
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(202)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    fetchSpy.mockRestore()
  })

  it('passes a Canvas failure status and body through unchanged', async () => {
    process.env.INGEST_URL = 'http://backend:8001/ingest'
    const body = {
      error: 'Canvas rejected the configured access token',
      upstream: 'canvas',
      upstream_status: 401,
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        }),
      )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          courseName: 'CS101',
          canvas_url: 'http://canvas',
          selectedCanvasOptions: ['files'],
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith(body)
    // One ERROR, from backendFetch.
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('backend 502 POST /canvas_ingest'),
    )
    fetchSpy.mockRestore()
    consoleError.mockRestore()
  })

  it('returns 500 and logs the Canvas URL when the call throws', async () => {
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
          courseName: 'CS101',
          canvas_url: 'http://canvas',
          selectedCanvasOptions: ['files'],
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*Canvas ingest submission failed canvas_url=http:\/\/canvas\nError: connect ECONNREFUSED/,
      ),
    )
    fetchSpy.mockRestore()
    consoleError.mockRestore()
  })
})
