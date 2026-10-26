/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

import {
  extractCourseName,
  getCourseMetadata,
  hasCourseAccess,
  isApprovedUser,
  isCourseAdmin,
  isCourseOwner,
  isCourseRegularUser,
  withCourseAccess,
  withCourseAdminAccess,
  withCourseOwnerAccess,
  withCourseOwnerOrAdminAccess,
  withCourseAccessFromRequest,
} from '~/server/authorization'

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (fn: any) => fn,
}))

const hoisted = vi.hoisted(() => ({
  hGetMock: vi.fn(),
}))
vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(async () => ({
    hGet: hoisted.hGetMock,
  })),
}))

describe('authorization helpers', () => {
  it('extractCourseName finds course name from query/body/headers', () => {
    expect(
      extractCourseName(createMockReq({ query: { courseName: 'A' } })),
    ).toEqual({ courseName: 'A', conflict: false })
    expect(
      extractCourseName(createMockReq({ query: { project_name: 'B' } })),
    ).toEqual({ courseName: 'B', conflict: false })
    expect(
      extractCourseName(createMockReq({ body: { course_name: 'C' } })),
    ).toEqual({ courseName: 'C', conflict: false })
    expect(
      extractCourseName(createMockReq({ headers: { 'x-course-name': 'D' } })),
    ).toEqual({ courseName: 'D', conflict: false })
    expect(extractCourseName(createMockReq())).toEqual({
      courseName: null,
      conflict: false,
    })
  })

  it('extractCourseName flags conflicts and ignores empty values (#312)', () => {
    // Same name in two places is fine.
    expect(
      extractCourseName(
        createMockReq({
          query: { course_name: 'A' },
          body: { project_name: 'A' },
        }),
      ),
    ).toEqual({ courseName: 'A', conflict: false })

    // Different names across query and body -> conflict.
    expect(
      extractCourseName(
        createMockReq({
          query: { courseName: 'A' },
          body: { courseName: 'B' },
        }),
      ).conflict,
    ).toBe(true)

    // Different names within the query (courseName vs course_name) -> conflict.
    expect(
      extractCourseName(
        createMockReq({ query: { courseName: 'A', course_name: 'B' } }),
      ).conflict,
    ).toBe(true)

    // Header disagreeing with body -> conflict.
    expect(
      extractCourseName(
        createMockReq({
          headers: { 'x-course-name': 'A' },
          body: { course_name: 'B' },
        }),
      ).conflict,
    ).toBe(true)

    // Repeated query key arrives as an array -> non-string -> conflict.
    expect(
      extractCourseName(
        createMockReq({ query: { course_name: ['A', 'B'] as any } }),
      ).conflict,
    ).toBe(true)

    // A non-string body value is rejected.
    expect(
      extractCourseName(
        createMockReq({ body: { course_name: { nested: 'x' } as any } }),
      ).conflict,
    ).toBe(true)

    // Empty string and null are skipped, not treated as names.
    expect(
      extractCourseName(
        createMockReq({
          query: { courseName: '' },
          body: { course_name: null as any },
        }),
      ),
    ).toEqual({ courseName: null, conflict: false })
  })

  it('withCourseOwnerOrAdminAccess rejects conflicting names with 400 before the handler', async () => {
    const handler = vi.fn()
    const wrapped = withCourseOwnerOrAdminAccess()(handler)
    const res = createMockRes()
    await wrapped(
      createMockReq({
        method: 'POST',
        query: { course_name: 'A' },
        body: { courseName: 'B' },
        user: { email: 'owner@example.com' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('withCourseAccessFromRequest rejects a public/private name mismatch with 400 (anonymous)', async () => {
    const handler = vi.fn()
    const wrapped = withCourseAccessFromRequest('any')(handler)
    const res = createMockRes()
    // Public project A in the query, private project B in the body: the old
    // behavior ran the handler unauthenticated against B.
    await wrapped(
      createMockReq({
        method: 'POST',
        query: { courseName: 'A' },
        body: { courseName: 'B' },
        user: null,
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('getCourseMetadata returns null when redis has no record or JSON parse fails', async () => {
    hoisted.hGetMock.mockResolvedValueOnce(null)
    await expect(getCourseMetadata('CS101')).resolves.toBeNull()

    hoisted.hGetMock.mockResolvedValueOnce('not-json')
    await expect(getCourseMetadata('CS101')).resolves.toBeNull()
  })

  it('getCourseMetadata returns parsed metadata when present', async () => {
    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        course_admins: ['admin@example.com'],
        course_owner: 'owner@example.com',
        approved_emails_list: ['approved@example.com'],
        allow_logged_in_users: false,
        is_private: true,
      }),
    )

    const meta = await getCourseMetadata('CS101')
    expect(meta?.course_owner).toBe('owner@example.com')
  })

  it('getCourseMetadata returns null when redis access throws', async () => {
    const { ensureRedisConnected } = await import('~/utils/redisClient')
    vi.mocked(ensureRedisConnected).mockRejectedValueOnce(new Error('boom'))
    await expect(getCourseMetadata('CS101')).resolves.toBeNull()
  })

  it('computes access helpers correctly', () => {
    const meta: any = {
      course_admins: ['admin@example.com'],
      course_owner: 'owner@example.com',
      approved_emails_list: ['approved@example.com'],
      allow_logged_in_users: false,
      is_private: true,
    }

    expect(isCourseOwner({} as any, meta)).toBe(false)
    expect(isCourseAdmin({} as any, meta)).toBe(false)
    expect(isApprovedUser({} as any, meta)).toBe(false)
    expect(
      hasCourseAccess({ email: 'other@example.com' } as any, {
        ...meta,
        allow_logged_in_users: true,
      }),
    ).toBe(true)

    expect(isCourseOwner({ email: 'owner@example.com' } as any, meta)).toBe(
      true,
    )
    expect(isCourseOwner({ email: 'x@example.com' } as any, meta)).toBe(false)
    expect(isCourseAdmin({ email: 'admin@example.com' } as any, meta)).toBe(
      true,
    )
    expect(isApprovedUser({ email: 'approved@example.com' } as any, meta)).toBe(
      true,
    )
    expect(
      hasCourseAccess({ email: 'approved@example.com' } as any, meta),
    ).toBe(true)
    expect(
      isCourseRegularUser({ email: 'approved@example.com' } as any, meta),
    ).toBe(true)
    expect(
      isCourseRegularUser({ email: 'admin@example.com' } as any, meta),
    ).toBe(false)
  })

  it('withCourseAccess enforces authentication, course existence, and membership', async () => {
    const handler = vi.fn(async (_req: any, res: any) =>
      res.status(200).json({ ok: true }),
    )
    const wrapped = withCourseAccess('CS101')(handler)

    const res1 = createMockRes()
    await wrapped(
      createMockReq({ method: 'GET', user: null }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(401)

    hoisted.hGetMock.mockResolvedValueOnce(null)
    const res2 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'GET',
        user: { email: 'approved@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(404)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: [],
        approved_emails_list: [],
        allow_logged_in_users: false,
      }),
    )
    const res3 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'GET',
        user: { email: 'someone@example.com' },
      }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(403)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: [],
        approved_emails_list: [],
        allow_logged_in_users: true,
      }),
    )
    const res4 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'GET',
        user: { email: 'someone@example.com' },
      }) as any,
      res4 as any,
    )
    expect(res4.status).toHaveBeenCalledWith(200)
    expect(handler).toHaveBeenCalled()
  })

  it('withCourseAdminAccess allows only admins/owners', async () => {
    const handler = vi.fn(async (_req: any, res: any) =>
      res.status(200).json({ ok: true }),
    )
    const wrapped = withCourseAdminAccess('CS101')(handler)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: ['admin@example.com'],
        approved_emails_list: ['approved@example.com'],
        allow_logged_in_users: false,
      }),
    )
    const res1 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'POST',
        user: { email: 'approved@example.com' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(403)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: ['admin@example.com'],
        approved_emails_list: [],
        allow_logged_in_users: false,
      }),
    )
    const res2 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'POST',
        user: { email: 'admin@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: [],
        approved_emails_list: [],
        allow_logged_in_users: false,
      }),
    )
    const res3 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'POST',
        user: { email: 'owner@example.com' },
      }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(200)
  })

  it('withCourseOwnerAccess allows only owners', async () => {
    const handler = vi.fn(async (_req: any, res: any) =>
      res.status(200).json({ ok: true }),
    )
    const wrapped = withCourseOwnerAccess('CS101')(handler)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: ['admin@example.com'],
        approved_emails_list: [],
        allow_logged_in_users: false,
      }),
    )
    const res1 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'DELETE',
        user: { email: 'admin@example.com' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(403)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: [],
        approved_emails_list: [],
        allow_logged_in_users: false,
      }),
    )
    const res2 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'DELETE',
        user: { email: 'owner@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
  })

  it('withCourseOwnerOrAdminAccess extracts course name and validates role', async () => {
    const handler = vi.fn(async (req: any, res: any) =>
      res.status(200).json({ ok: true, course: req.courseName }),
    )
    const wrapped = withCourseOwnerOrAdminAccess()(handler)

    const res1 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'POST',
        user: { email: 'owner@example.com' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(400)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: [],
        approved_emails_list: [],
        allow_logged_in_users: false,
      }),
    )
    const res2 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'POST',
        query: { courseName: 'CS101' },
        user: { email: 'approved@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(403)

    hoisted.hGetMock.mockResolvedValueOnce(null)
    const res3 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'POST',
        query: { courseName: 'CS101' },
        user: { email: 'owner@example.com' },
      }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(404)

    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: ['admin@example.com'],
        approved_emails_list: [],
        allow_logged_in_users: false,
      }),
    )
    const res4 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'POST',
        query: { courseName: 'CS101' },
        user: { email: 'admin@example.com' },
      }) as any,
      res4 as any,
    )
    expect(res4.status).toHaveBeenCalledWith(200)
    expect(res4.json).toHaveBeenCalledWith({ ok: true, course: 'CS101' })
  })

  it('withCourseAccessFromRequest returns 400 when no course name is present', async () => {
    const handler = vi.fn()
    const wrapped = withCourseAccessFromRequest('any')(handler)

    const req = createMockReq({ method: 'GET' })
    const res = createMockRes()

    await wrapped(req as any, res as any)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('withCourseAccessFromRequest allows unauthenticated access to public courses', async () => {
    hoisted.hGetMock.mockResolvedValueOnce(
      JSON.stringify({
        is_private: false,
        allow_logged_in_users: false,
      }),
    )

    const handler = vi.fn(async (req: any, res: any) =>
      res.status(200).json({ ok: true, course: req.courseName }),
    )
    const wrapped = withCourseAccessFromRequest('any')(handler)

    const req = createMockReq({ method: 'GET', query: { courseName: 'CS101' } })
    const res = createMockRes()

    await wrapped(req as any, res as any)
    expect(handler).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true, course: 'CS101' })
  })

  it('withCourseAccessFromRequest enforces authentication for private courses', async () => {
    hoisted.hGetMock.mockResolvedValueOnce(JSON.stringify({ is_private: true }))

    const handler = vi.fn()
    const wrapped = withCourseAccessFromRequest('any')(handler)

    const req = createMockReq({
      method: 'GET',
      query: { courseName: 'CS101' },
      user: null,
    })
    const res = createMockRes()

    await wrapped(req as any, res as any)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('withCourseAccessFromRequest supports method-specific access levels', async () => {
    hoisted.hGetMock.mockResolvedValue(
      JSON.stringify({
        is_private: true,
        course_owner: 'owner@example.com',
        course_admins: ['admin@example.com'],
        approved_emails_list: [],
        allow_logged_in_users: false,
      }),
    )

    const handler = vi.fn(async (_req: any, res: any) =>
      res.status(200).json({ ok: true }),
    )
    const wrapped = withCourseAccessFromRequest({
      DELETE: 'owner',
      POST: 'admin',
    })(handler)

    const res1 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'DELETE',
        query: { courseName: 'CS101' },
        user: { email: 'admin@example.com' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(403)

    const res2 = createMockRes()
    await wrapped(
      createMockReq({
        method: 'DELETE',
        query: { courseName: 'CS101' },
        user: { email: 'owner@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
  })
})
