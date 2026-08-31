/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  switchN8nWorkflow: vi.fn(),
  getN8nWorkflows: vi.fn(),
}))

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (fn: any) => fn,
}))

vi.mock('~/pages/api/authorization', () => ({
  withCourseAccessFromRequest: () => (handler: any) => handler,
}))

vi.mock('~/utils/n8nClient', () => ({
  getN8nWorkflows: hoisted.getN8nWorkflows,
  switchN8nWorkflow: hoisted.switchN8nWorkflow,
  N8nUnauthorizedError: class N8nUnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
      super(message)
      this.name = 'N8nUnauthorizedError'
    }
  },
}))

vi.mock('~/db/schema', () => ({
  projects: {
    id: { name: 'id' },
    course_name: { name: 'course_name' },
    n8n_api_key: { name: 'n8n_api_key' },
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
}))

vi.mock('~/db/dbClient', () => ({
  db: {
    select: hoisted.select,
    insert: hoisted.insert,
  },
}))

import activateWorkflowHandler from '~/pages/api/UIUC-api/tools/activateWorkflow'
import getN8nKeyFromProjectHandler from '~/pages/api/UIUC-api/tools/getN8nKeyFromProject'
import testN8nAPIHandler from '~/pages/api/UIUC-api/tools/testN8nAPI'
import upsertN8nAPIKeyHandler from '~/pages/api/UIUC-api/tools/upsertN8nAPIKey'

describe('UIUC-api/tools routes', () => {
  beforeEach(() => {
    hoisted.select.mockReset()
    hoisted.insert.mockReset()
    hoisted.switchN8nWorkflow.mockReset()
    hoisted.getN8nWorkflows.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('activateWorkflow returns 200 on success and status on backend failures', async () => {
    hoisted.switchN8nWorkflow.mockResolvedValueOnce({ ok: true })

    const res1 = createMockRes()
    await activateWorkflowHandler(
      createMockReq({
        query: { api_key: 'k', id: '1', activate: 'true' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(200)

    hoisted.switchN8nWorkflow.mockRejectedValueOnce(new Error('Bad Gateway'))
    const res2 = createMockRes()
    const result = await activateWorkflowHandler(
      createMockReq({
        query: { api_key: 'k', id: '1', activate: 'true' },
      }) as any,
      res2 as any,
    )
    expect(result).toBeInstanceOf(Error)

    hoisted.switchN8nWorkflow.mockResolvedValueOnce({ message: 'bad request' })
    const res3 = createMockRes()
    await activateWorkflowHandler(
      createMockReq({
        query: { api_key: 'k', id: '1', activate: 'true' },
      }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(400)

    const { N8nUnauthorizedError } = await import('~/utils/n8nClient')
    hoisted.switchN8nWorkflow.mockRejectedValueOnce(new N8nUnauthorizedError())
    const res4 = createMockRes()
    await activateWorkflowHandler(
      createMockReq({
        query: { api_key: 'k', id: '1', activate: 'false' },
      }) as any,
      res4 as any,
    )
    expect(res4.status).toHaveBeenCalledWith(401)
  })

  it('getN8nKeyFromProject returns 404 when missing, 200 when found, and 500 on db error', async () => {
    hoisted.select.mockImplementationOnce(() => ({
      from: () => ({
        where: vi.fn().mockResolvedValueOnce([]),
      }),
    }))

    const res1 = createMockRes()
    await getN8nKeyFromProjectHandler(
      createMockReq({ query: { course_name: 'CS101' } }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(404)

    hoisted.select.mockImplementationOnce(() => ({
      from: () => ({
        where: vi.fn().mockResolvedValueOnce([{ n8n_api_key: 'k' }]),
      }),
    }))
    const res2 = createMockRes()
    await getN8nKeyFromProjectHandler(
      createMockReq({ query: { course_name: 'CS101' } }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
    expect(res2.json).toHaveBeenCalledWith('k')

    hoisted.select.mockImplementationOnce(() => ({
      from: () => ({
        where: vi.fn().mockRejectedValueOnce(new Error('boom')),
      }),
    }))
    const res3 = createMockRes()
    await getN8nKeyFromProjectHandler(
      createMockReq({ query: { course_name: 'CS101' } }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(500)
  })

  it('upsertN8nAPIKey validates input and returns 200/500', async () => {
    const res1 = createMockRes()
    await upsertN8nAPIKeyHandler(
      createMockReq({ method: 'POST', body: { n8n_api_key: 'k' } }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(400)

    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValueOnce(undefined),
      }),
    })
    const res2 = createMockRes()
    await upsertN8nAPIKeyHandler(
      createMockReq({
        method: 'POST',
        body: { course_name: 'CS101', n8n_api_key: 'k' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)

    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockRejectedValueOnce(new Error('boom')),
      }),
    })
    const res3 = createMockRes()
    await upsertN8nAPIKeyHandler(
      createMockReq({
        method: 'POST',
        body: { course_name: 'CS101', n8n_api_key: 'k' },
      }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(500)
  })

  it('testN8nAPI returns 200 on ok and rejects on non-ok responses', async () => {
    hoisted.getN8nWorkflows.mockResolvedValueOnce([[{ id: 'w' }]])

    const res1 = createMockRes()
    await testN8nAPIHandler(
      createMockReq({ method: 'POST', body: { n8nApiKey: 'k' } }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(200)

    hoisted.getN8nWorkflows.mockRejectedValueOnce(new Error('boom'))

    await expect(
      testN8nAPIHandler(
        createMockReq({ method: 'POST', body: { n8nApiKey: 'k' } }) as any,
        createMockRes() as any,
      ),
    ).rejects.toThrow('Unable to fetch n8n tools')
  })
})
