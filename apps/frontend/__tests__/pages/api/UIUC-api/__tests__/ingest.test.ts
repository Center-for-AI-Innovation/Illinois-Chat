/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

vi.mock('~/server/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
}))

import handler from '~/pages/api/UIUC-api/ingest'

const VALID_BODY = {
  uniqueFileName: 'abc-handbook.pdf',
  courseName: 'CS101',
  readableFilename: 'handbook.pdf',
  forceEmbeddings: false,
}

const fetchMock = vi.fn()
const realEnv = { ...process.env }

function headersOf(call: any): Record<string, string> {
  return call[1].headers as Record<string, string>
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ status: 200, json: async () => ({ task_id: 't1' }) })
  process.env.INGEST_URL = 'http://backend:8001/ingest'
  delete process.env.INGEST_API_KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...realEnv }
})

describe('UIUC-api/ingest', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when body parameters are missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: { courseName: 'CS101' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the s3 path to INGEST_URL', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: VALID_BODY }) as any,
      res as any,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as any
    expect(call[0]).toBe('http://backend:8001/ingest')
    expect(JSON.parse(call[1].body)).toMatchObject({
      course_name: 'CS101',
      readable_filename: 'handbook.pdf',
      s3_paths: 'courses/CS101/abc-handbook.pdf',
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('omits Authorization when INGEST_API_KEY is unset', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: VALID_BODY }) as any,
      res as any,
    )
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBeUndefined()
  })

  it('sends Authorization when INGEST_API_KEY is set', async () => {
    process.env.INGEST_API_KEY = 'ingest-secret'
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: VALID_BODY }) as any,
      res as any,
    )
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe(
      'Bearer ingest-secret',
    )
  })

  it('returns 500 when the ingest call throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: VALID_BODY }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
