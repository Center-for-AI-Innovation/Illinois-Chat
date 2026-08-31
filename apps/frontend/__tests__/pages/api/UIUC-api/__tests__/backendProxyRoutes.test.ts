import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  getN8nWorkflows: vi.fn(),
  getDocumentsDb: vi.fn(),
}))

vi.mock('~/pages/api/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
  withCourseAccessFromRequest: () => (h: any) => h,
}))

vi.mock('~/utils/n8nClient', () => ({
  getN8nWorkflows: hoisted.getN8nWorkflows,
  N8nUnauthorizedError: class N8nUnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
      super(message)
      this.name = 'N8nUnauthorizedError'
    }
  },
}))

vi.mock('~/utils/connectionManager', () => ({
  connectionManager: { getDocumentsDb: hoisted.getDocumentsDb },
}))

import getAllCourseDataHandler from '~/pages/api/UIUC-api/getAllCourseData'
import getN8nWorkflowsHandler from '~/pages/api/UIUC-api/getN8nWorkflows'
import { N8nUnauthorizedError } from '~/utils/n8nClient'

describe('UIUC-api backend proxy routes', () => {
  it('getAllCourseData validates method/params and returns distinct documents', async () => {
    const res1 = createMockRes()
    await getAllCourseDataHandler(
      createMockReq({ method: 'POST' }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(405)

    const res2 = createMockRes()
    await getAllCourseDataHandler(
      createMockReq({ method: 'GET', query: {} }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(400)

    hoisted.getDocumentsDb.mockRejectedValueOnce(new Error('db down'))
    const res3 = createMockRes()
    await getAllCourseDataHandler(
      createMockReq({ method: 'GET', query: { course_name: 'CS101' } }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(500)

    const docs = [
      {
        s3_path: 'a',
        readable_filename: 'a.pdf',
        course_name: 'CS101',
        url: null,
        base_url: null,
      },
      {
        s3_path: 'a',
        readable_filename: 'a.pdf',
        course_name: 'CS101',
        url: null,
        base_url: null,
      },
      {
        s3_path: 'b',
        readable_filename: 'b.pdf',
        course_name: 'CS101',
        url: 'http://x',
        base_url: 'http://x',
      },
    ]
    hoisted.getDocumentsDb.mockResolvedValueOnce({
      selectDistinct: () => ({
        from: () => ({
          // Postgres does the dedup now; the driver hands back distinct rows.
          where: async () => [docs[0], docs[2]],
        }),
      }),
    })

    const res4 = createMockRes()
    await getAllCourseDataHandler(
      createMockReq({ method: 'GET', query: { course_name: 'CS101' } }) as any,
      res4 as any,
    )
    expect(res4.status).toHaveBeenCalledWith(200)
    expect(res4.json).toHaveBeenCalledWith({
      distinct_files: [docs[0], docs[2]],
    })
  })

  it('getN8nWorkflows validates inputs and calls n8n directly', async () => {
    const res1 = createMockRes()
    await getN8nWorkflowsHandler(
      createMockReq({ method: 'POST' }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(405)

    const res2 = createMockRes()
    await getN8nWorkflowsHandler(
      createMockReq({ method: 'GET', query: {} }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(400)

    hoisted.getN8nWorkflows.mockRejectedValueOnce(new Error('boom'))
    const res3 = createMockRes()
    await getN8nWorkflowsHandler(
      createMockReq({ method: 'GET', query: { api_key: 'k' } }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(500)

    hoisted.getN8nWorkflows.mockRejectedValueOnce(new N8nUnauthorizedError())
    const res401 = createMockRes()
    await getN8nWorkflowsHandler(
      createMockReq({ method: 'GET', query: { api_key: 'k' } }) as any,
      res401 as any,
    )
    expect(res401.status).toHaveBeenCalledWith(401)

    hoisted.getN8nWorkflows.mockResolvedValueOnce([[{ id: 'w1' }]])
    const res4 = createMockRes()
    await getN8nWorkflowsHandler(
      createMockReq({
        method: 'GET',
        query: { api_key: 'k', limit: '25', pagination: 'false' },
      }) as any,
      res4 as any,
    )
    expect(res4.status).toHaveBeenCalledWith(200)
    expect(hoisted.getN8nWorkflows).toHaveBeenCalledWith({
      apiKey: 'k',
      limit: 25,
      pagination: false,
    })
  })
})
