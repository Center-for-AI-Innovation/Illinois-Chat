/* @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextApiResponse } from 'next'

const hoisted = vi.hoisted(() => ({
  hGet: vi.fn(),
  isSuperAdmin: vi.fn(async () => false),
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(async () => ({ hGet: hoisted.hGet })),
}))
vi.mock('~/utils/superAdmins.server', () => ({
  isSuperAdminAsync: hoisted.isSuperAdmin,
}))
vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (fn: unknown) => fn,
}))

import handler from '../getCourseRole'

function run(query: Record<string, string>, email?: string) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(b: unknown) {
      this.body = b
      return this
    },
  }
  const req = { query, user: email ? { email } : undefined }
  const fn = handler as unknown as (
    req: unknown,
    res: NextApiResponse,
  ) => Promise<void>
  return fn(req, res as unknown as NextApiResponse).then(() => res)
}

const stored = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    course_owner: 'owner@illinois.edu',
    course_admins: ['admin@illinois.edu'],
    approved_emails_list: [],
    is_private: true,
    ...over,
  })

describe('GET /api/UIUC-api/getCourseRole', () => {
  beforeEach(() => {
    hoisted.hGet.mockReset()
    hoisted.isSuperAdmin.mockReset()
    hoisted.isSuperAdmin.mockResolvedValue(false)
  })

  it('returns the role for a signed-in user', async () => {
    hoisted.hGet.mockResolvedValue(stored())
    const res = await run({ course_name: 'c' }, 'admin@illinois.edu')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ role: 'admin' })
  })

  it('returns super_admin for a platform super admin with no project role', async () => {
    hoisted.hGet.mockResolvedValue(stored())
    hoisted.isSuperAdmin.mockResolvedValue(true)
    const res = await run({ course_name: 'c' }, 'root@illinois.edu')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ role: 'super_admin' })
  })

  it('keeps the project role for a super admin who owns the project', async () => {
    hoisted.hGet.mockResolvedValue(stored())
    hoisted.isSuperAdmin.mockResolvedValue(true)
    const res = await run({ course_name: 'c' }, 'owner@illinois.edu')
    expect(res.body).toEqual({ role: 'owner' })
  })

  it('returns 403 to a super admin when the project is frozen', async () => {
    hoisted.hGet.mockResolvedValue(stored({ is_frozen: true }))
    hoisted.isSuperAdmin.mockResolvedValue(true)
    const res = await run({ course_name: 'c' }, 'root@illinois.edu')
    expect(res.statusCode).toBe(403)
  })

  it('returns 401 when signed out', async () => {
    const res = await run({ course_name: 'c' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when the project does not exist', async () => {
    hoisted.hGet.mockResolvedValue(null)
    const res = await run({ course_name: 'missing' }, 'a@illinois.edu')
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when the project is frozen', async () => {
    hoisted.hGet.mockResolvedValue(stored({ is_frozen: true }))
    const res = await run({ course_name: 'c' }, 'owner@illinois.edu')
    expect(res.statusCode).toBe(403)
  })
})
