/* @vitest-environment node */

// Super admins reach projects through a live check instead of being written
// into `course_admins`. That makes the bypass revocable, but it also means the
// boundaries have to be pinned down: it covers admin-and-below, and it must
// not cover owner-only actions, frozen projects, or projects that don't exist.

import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedUser } from '~/middleware'
import type { AuthenticatedRequest } from '~/utils/appRouterAuth'
import { withCourseAccessFromRequest } from '../authorization'

const hoisted = vi.hoisted(() => ({
  hGet: vi.fn(),
  isSuperAdminAsync: vi.fn(async (_email?: string) => false),
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(async () => ({ hGet: hoisted.hGet })),
}))

vi.mock('~/utils/appRouterAuth', () => ({
  withAppRouterAuth: (fn: (req: unknown) => unknown) => (req: unknown) =>
    fn(req),
}))

vi.mock('~/utils/superAdmins.server', () => ({
  isSuperAdminAsync: hoisted.isSuperAdminAsync,
}))

type TestRequest = AuthenticatedRequest & {
  courseName?: string
  user?: AuthenticatedUser
}

const PRIVATE_COURSE = {
  is_private: true,
  course_owner: 'owner@example.com',
  course_admins: ['admin@example.com'],
  approved_emails_list: [],
  allow_logged_in_users: false,
}

function requestAs(email: string | null, method: string): TestRequest {
  const req = new NextRequest('http://localhost/api?courseName=CS101', {
    method,
  }) as unknown as TestRequest
  if (email) req.user = { email } as AuthenticatedUser
  return req
}

function wrap(
  access: Parameters<typeof withCourseAccessFromRequest>[0],
  handler = vi.fn(async (_req: AuthenticatedRequest) =>
    NextResponse.json({ ok: true }),
  ),
) {
  return { wrapped: withCourseAccessFromRequest(access)(handler), handler }
}

beforeEach(() => {
  hoisted.hGet.mockReset()
  hoisted.isSuperAdminAsync.mockReset()
  hoisted.isSuperAdminAsync.mockResolvedValue(false)
})

describe('app/api super-admin project bypass', () => {
  it('lets a super admin into a private project they are not a member of', async () => {
    hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
    hoisted.isSuperAdminAsync.mockResolvedValue(true)

    const { wrapped, handler } = wrap('any')
    const res = await wrapped(requestAs('super@example.com', 'GET'))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalled()
  })

  it('lets a super admin perform an admin-tier action', async () => {
    hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
    hoisted.isSuperAdminAsync.mockResolvedValue(true)

    const { wrapped } = wrap({ POST: 'admin' })
    expect((await wrapped(requestAs('super@example.com', 'POST'))).status).toBe(
      200,
    )
  })

  it('still refuses a super admin an owner-tier action', async () => {
    hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
    hoisted.isSuperAdminAsync.mockResolvedValue(true)

    const { wrapped, handler } = wrap({ DELETE: 'owner' })
    const res = await wrapped(requestAs('super@example.com', 'DELETE'))

    // Owner tier guards destructive, single-owner operations. A platform role
    // is not a claim of project ownership.
    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('still refuses a super admin a frozen project', async () => {
    hoisted.hGet.mockResolvedValue(
      JSON.stringify({ ...PRIVATE_COURSE, is_frozen: true }),
    )
    hoisted.isSuperAdminAsync.mockResolvedValue(true)

    const { wrapped, handler } = wrap('any')
    const res = await wrapped(requestAs('super@example.com', 'GET'))

    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('still 404s a super admin on a project that does not exist', async () => {
    hoisted.hGet.mockResolvedValue(null)
    hoisted.isSuperAdminAsync.mockResolvedValue(true)

    const { wrapped, handler } = wrap('any')
    const res = await wrapped(requestAs('super@example.com', 'GET'))

    expect(res.status).toBe(404)
    expect(handler).not.toHaveBeenCalled()
  })

  it('still requires authentication', async () => {
    hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
    hoisted.isSuperAdminAsync.mockResolvedValue(true)

    const { wrapped } = wrap('any')
    expect((await wrapped(requestAs(null, 'GET'))).status).toBe(401)
  })

  it('revoking the grant removes access on the next request', async () => {
    hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))

    const { wrapped } = wrap('any')

    hoisted.isSuperAdminAsync.mockResolvedValue(true)
    expect((await wrapped(requestAs('super@example.com', 'GET'))).status).toBe(
      200,
    )

    // Nothing was persisted to `course_admins`, so a revoked grant takes
    // effect immediately rather than leaving project membership behind.
    hoisted.isSuperAdminAsync.mockResolvedValue(false)
    expect((await wrapped(requestAs('super@example.com', 'GET'))).status).toBe(
      403,
    )
  })

  it('does not consult the super-admin store when a normal check passes', async () => {
    hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))

    const { wrapped } = wrap({ POST: 'admin' })
    expect((await wrapped(requestAs('admin@example.com', 'POST'))).status).toBe(
      200,
    )

    // The bypass costs a Redis read, so it must stay off the hot path for
    // ordinary authorized traffic.
    expect(hoisted.isSuperAdminAsync).not.toHaveBeenCalled()
  })

  it('checks the super-admin store at most once per request', async () => {
    hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))
    hoisted.isSuperAdminAsync.mockResolvedValue(true)

    const { wrapped } = wrap({ POST: 'admin' })
    // Private-course gate and admin-tier gate both need the answer.
    expect((await wrapped(requestAs('super@example.com', 'POST'))).status).toBe(
      200,
    )
    expect(hoisted.isSuperAdminAsync).toHaveBeenCalledTimes(1)
  })

  it('denies a non-super-admin exactly as before', async () => {
    hoisted.hGet.mockResolvedValue(JSON.stringify(PRIVATE_COURSE))

    const { wrapped } = wrap('any')
    expect((await wrapped(requestAs('nobody@example.com', 'GET'))).status).toBe(
      403,
    )
  })
})
