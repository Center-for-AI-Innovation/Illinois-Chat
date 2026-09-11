/* @vitest-environment node */

// Pages Router counterpart to src/app/api/__tests__/authorization.superAdmin.test.ts.
// Both routers have to agree, or an operator's access depends on which router
// happens to serve a given endpoint.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  withCourseAccess,
  withCourseAccessFromRequest,
  withCourseAdminAccess,
  withCourseOwnerAccess,
  withCourseOwnerOrAdminAccess,
} from '../authorization'

const hoisted = vi.hoisted(() => ({
  hGet: vi.fn(),
  isSuperAdminAsync: vi.fn(async (_email?: string) => false),
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(async () => ({ hGet: hoisted.hGet })),
}))

vi.mock('~/utils/authMiddleware', () => ({
  withAuth:
    (fn: (req: any, res: any) => unknown) => (req: any, res: any) =>
      fn(req, res),
}))

vi.mock('~/utils/superAdmins.server', () => ({
  isSuperAdminAsync: hoisted.isSuperAdminAsync,
}))

const PRIVATE_COURSE = {
  is_private: true,
  course_owner: 'owner@example.com',
  course_admins: ['admin@example.com'],
  approved_emails_list: [],
  allow_logged_in_users: false,
}

function makeRes() {
  const res: any = {}
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

function requestAs(
  email: string | null,
  method = 'GET',
  query: Record<string, string> = { courseName: 'CS101' },
) {
  return {
    method,
    query,
    headers: {},
    body: {},
    ...(email ? { user: { email } } : {}),
  } as any
}

beforeEach(() => {
  hoisted.hGet.mockReset()
  hoisted.isSuperAdminAsync.mockReset()
  hoisted.isSuperAdminAsync.mockResolvedValue(false)
})

describe('pages/api super-admin project bypass', () => {
  describe('withCourseAccess', () => {
    it('admits a super admin who is not a member', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      const res = makeRes()
      await withCourseAccess('CS101')(handler)(
        requestAs('super@example.com'),
        res,
      )

      expect(handler).toHaveBeenCalled()
    })

    it('denies a non-member who is not a super admin', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))

      const handler = vi.fn()
      const res = makeRes()
      await withCourseAccess('CS101')(handler)(
        requestAs('nobody@example.com'),
        res,
      )

      expect(res.statusCode).toBe(403)
      expect(handler).not.toHaveBeenCalled()
    })

    it('keeps the frozen-project block ahead of the bypass', async () => {
      hoisted.hGet.mockResolvedValue(
        JSON.stringify({ ...PRIVATE_COURSE, is_frozen: true }),
      )
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      const res = makeRes()
      await withCourseAccess('CS101')(handler)(
        requestAs('super@example.com'),
        res,
      )

      expect(res.statusCode).toBe(403)
      expect(handler).not.toHaveBeenCalled()
    })

    it('keeps the 404 for a missing project ahead of the bypass', async () => {
      hoisted.hGet.mockResolvedValue(null)
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      const res = makeRes()
      await withCourseAccess('CS101')(handler)(
        requestAs('super@example.com'),
        res,
      )

      expect(res.statusCode).toBe(404)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('withCourseAdminAccess', () => {
    it('admits a super admin', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      await withCourseAdminAccess('CS101')(handler)(
        requestAs('super@example.com'),
        makeRes(),
      )

      expect(handler).toHaveBeenCalled()
    })

    it('does not consult the store when the user is already an admin', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))

      const handler = vi.fn()
      await withCourseAdminAccess('CS101')(handler)(
        requestAs('admin@example.com'),
        makeRes(),
      )

      expect(handler).toHaveBeenCalled()
      expect(hoisted.isSuperAdminAsync).not.toHaveBeenCalled()
    })
  })

  describe('withCourseOwnerAccess', () => {
    it('refuses a super admin', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      const res = makeRes()
      await withCourseOwnerAccess('CS101')(handler)(
        requestAs('super@example.com'),
        res,
      )

      expect(res.statusCode).toBe(403)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('withCourseOwnerOrAdminAccess', () => {
    it('admits a super admin', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      await withCourseOwnerOrAdminAccess()(handler)(
        requestAs('super@example.com'),
        makeRes(),
      )

      expect(handler).toHaveBeenCalled()
    })

    it('still 400s without a course name', async () => {
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      const res = makeRes()
      await withCourseOwnerOrAdminAccess()(handler)(
        requestAs('super@example.com', 'GET', {}),
        res,
      )

      expect(res.statusCode).toBe(400)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('withCourseAccessFromRequest', () => {
    it('admits a super admin at the admin tier', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      await withCourseAccessFromRequest({ POST: 'admin' })(handler)(
        requestAs('super@example.com', 'POST'),
        makeRes(),
      )

      expect(handler).toHaveBeenCalled()
    })

    it('refuses a super admin at the owner tier', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
      hoisted.isSuperAdminAsync.mockResolvedValue(true)

      const handler = vi.fn()
      const res = makeRes()
      await withCourseAccessFromRequest({ DELETE: 'owner' })(handler)(
        requestAs('super@example.com', 'DELETE'),
        res,
      )

      expect(res.statusCode).toBe(403)
      expect(handler).not.toHaveBeenCalled()
      // Not merely denied — at the owner tier the store is never even asked,
      // so there is no path for a platform role to satisfy it.
      expect(hoisted.isSuperAdminAsync).not.toHaveBeenCalled()
    })

    it('revoking the grant removes access on the next request', async () => {
      hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
      const handler = vi.fn()
      const wrapped = withCourseAccessFromRequest('any')(handler)

      hoisted.isSuperAdminAsync.mockResolvedValue(true)
      await wrapped(requestAs('super@example.com'), makeRes())
      expect(handler).toHaveBeenCalledTimes(1)

      hoisted.isSuperAdminAsync.mockResolvedValue(false)
      const res = makeRes()
      await wrapped(requestAs('super@example.com'), res)
      expect(res.statusCode).toBe(403)
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })
})
