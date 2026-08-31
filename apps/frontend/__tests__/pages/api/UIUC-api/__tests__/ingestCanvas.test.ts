import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
}))

vi.mock('~/pages/api/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
}))

vi.mock('~/utils/sendTransactionalEmail', () => ({
  sendTransactionalEmail: hoisted.sendTransactionalEmail,
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
    hoisted.sendTransactionalEmail.mockRejectedValueOnce(new Error('smtp down'))

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
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
    expect(hoisted.sendTransactionalEmail).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(202)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  it('returns 500 when ingest submission throws', async () => {
    process.env.INGEST_URL = 'http://ingest/ingest'
    hoisted.sendTransactionalEmail.mockResolvedValueOnce(undefined)
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'))

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          courseName: 'CS101',
          canvas_url: 'http://canvas',
          selectedCanvasOptions: [],
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
