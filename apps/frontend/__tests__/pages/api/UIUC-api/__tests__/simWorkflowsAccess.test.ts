/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'
import getSimWorkflows from '~/pages/api/UIUC-api/getSimWorkflows'
import runSimWorkflow from '~/pages/api/UIUC-api/runSimWorkflow'

const hoisted = vi.hoisted(() => ({
  hGet: vi.fn(),
  resolveSimCredentials: vi.fn(),
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(async () => ({ hGet: hoisted.hGet })),
}))

// Stands in for the cookie check: a request without `testUser` has no token.
vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (fn: (req: any, res: any) => unknown) => (req: any, res: any) => {
    if (!req.testUser) {
      return res.status(401).json({ error: 'Missing token' })
    }
    req.user = req.testUser
    return fn(req, res)
  },
}))

vi.mock('~/utils/simConfig', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveSimCredentials: hoisted.resolveSimCredentials,
}))

function setProject(meta: Record<string, unknown>) {
  hoisted.hGet.mockResolvedValue(JSON.stringify(meta))
}

const listRequest = (testUser?: { email: string }) =>
  Object.assign(
    createMockReq({ method: 'GET', query: { course_name: 'legacy-bot' } }),
    { testUser },
  )

const runRequest = (testUser?: { email: string }) =>
  Object.assign(
    createMockReq({
      method: 'POST',
      body: { course_name: 'legacy-bot', workflow_id: 'wf-1', input: {} },
    }),
    { testUser },
  )

describe('Sim workflow routes access', () => {
  beforeEach(() => {
    hoisted.resolveSimCredentials.mockResolvedValue({
      ok: false,
      reason: 'not_configured',
    })
  })

  it('lists no tools for an anonymous visitor on a public project', async () => {
    setProject({ is_private: false, course_owner: 'owner@x.edu' })
    const res = createMockRes()

    await getSimWorkflows(listRequest(), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ workflows: [], failed: [] })
    expect(hoisted.resolveSimCredentials).toHaveBeenCalledWith('legacy-bot')
  })

  it('lists tools for a logged-in non-member on a public project', async () => {
    setProject({ is_private: false, course_owner: 'owner@x.edu' })
    const res = createMockRes()

    await getSimWorkflows(listRequest({ email: 'stranger@x.edu' }), res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('still requires a login for a private project', async () => {
    setProject({ is_private: true, course_owner: 'owner@x.edu' })
    const res = createMockRes()

    await getSimWorkflows(listRequest(), res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(hoisted.resolveSimCredentials).not.toHaveBeenCalled()
  })

  it('still requires membership for a private project', async () => {
    setProject({ is_private: true, course_owner: 'owner@x.edu' })
    const res = createMockRes()

    await getSimWorkflows(listRequest({ email: 'stranger@x.edu' }), res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(hoisted.resolveSimCredentials).not.toHaveBeenCalled()
  })

  it('reports a missing project name and an unknown project', async () => {
    let res = createMockRes()
    await getSimWorkflows(
      createMockReq({ method: 'GET', query: {} }) as never,
      res,
    )
    expect(res.status).toHaveBeenCalledWith(400)

    hoisted.hGet.mockResolvedValue(null)
    res = createMockRes()
    await getSimWorkflows(listRequest(), res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(hoisted.resolveSimCredentials).not.toHaveBeenCalled()
  })

  it('lets an anonymous visitor reach a public project tool run', async () => {
    setProject({ is_private: false, course_owner: 'owner@x.edu' })
    const res = createMockRes()

    await runSimWorkflow(runRequest(), res)

    // Past the access check, the unconfigured project is what stops it.
    expect(hoisted.resolveSimCredentials).toHaveBeenCalledWith('legacy-bot')
    expect(res.status).not.toHaveBeenCalledWith(401)
    expect(res.status).not.toHaveBeenCalledWith(403)
  })

  it('still requires membership to run a private project tool', async () => {
    setProject({ is_private: true, course_owner: 'owner@x.edu' })
    const res = createMockRes()

    await runSimWorkflow(runRequest({ email: 'stranger@x.edu' }), res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(hoisted.resolveSimCredentials).not.toHaveBeenCalled()
  })
})
