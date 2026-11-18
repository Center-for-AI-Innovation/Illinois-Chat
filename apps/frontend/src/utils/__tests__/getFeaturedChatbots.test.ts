import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import type { CourseMetadata } from '~/types/courseMetadata'
import handler from '~/pages/api/UIUC-api/getFeaturedChatbots'

const state = vi.hoisted(() => ({
  rows: [] as Array<{ course_name: string; raw_metadata: unknown }>,
}))

const isSuperAdminAsync = vi.hoisted(() => vi.fn())

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: unknown) => h,
}))

vi.mock('~/db/dbClient', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => state.rows }),
        }),
      }),
    }),
  },
  courseMetadata: {
    course_name: 'course_name',
    raw_metadata: 'raw_metadata',
    is_frozen: 'is_frozen',
    is_private: 'is_private',
  },
}))

vi.mock('~/utils/superAdmins.server', () => ({ isSuperAdminAsync }))

const CALLER_EMAIL = 'caller@example.com'

function makeMetadata(over: Partial<CourseMetadata> = {}): CourseMetadata {
  return {
    is_private: false,
    course_owner: 'owner@example.com',
    course_admins: [],
    approved_emails_list: ['secret-approved@example.com'],
    course_intro_message: 'internal intro',
    banner_image_s3: undefined,
    is_frozen: false,
    allow_logged_in_users: false,
    project_description: 'A featured bot',
    tags: [],
    ...over,
  } as CourseMetadata
}

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}

async function fetchFeatured(email = CALLER_EMAIL) {
  const req = {
    method: 'GET',
    user: { email },
  } as unknown as AuthenticatedRequest
  const res = makeRes()
  await (handler as unknown as (q: unknown, s: unknown) => Promise<void>)(
    req,
    res,
  )
  return res
}

function bodyOf(res: ReturnType<typeof makeRes>) {
  expect(res.status).toHaveBeenCalledWith(200)
  return res.json.mock.calls[0][0] as {
    results: Array<Record<string, unknown>>
    total: number
  }
}

describe('getFeaturedChatbots', () => {
  beforeEach(() => {
    state.rows = []
    isSuperAdminAsync.mockReset()
    isSuperAdminAsync.mockResolvedValue(false)
  })

  it('gives a non-member platform super admin the admin role on a bot that excludes them', async () => {
    isSuperAdminAsync.mockResolvedValue(true)
    state.rows = [
      {
        course_name: 'featured-101',
        raw_metadata: makeMetadata({
          course_owner: 'owner@example.com',
          course_admins: ['someone-else@example.com'],
        }),
      },
    ]

    const { results } = bodyOf(await fetchFeatured())

    expect(isSuperAdminAsync).toHaveBeenCalledWith(CALLER_EMAIL)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      course_name: 'featured-101',
      userRole: 'admin',
      owner: 'owner@example.com',
    })
  })

  it('does not grant the owner role or raw metadata to a super admin who is not a member', async () => {
    isSuperAdminAsync.mockResolvedValue(true)
    state.rows = [
      {
        course_name: 'featured-101',
        raw_metadata: makeMetadata({ course_owner: 'owner@example.com' }),
      },
    ]

    const { results } = bodyOf(await fetchFeatured())
    const serialized = JSON.stringify(results)

    expect(results[0].userRole).not.toBe('owner')
    expect(results[0].owner).toBe('owner@example.com')
    expect(results[0].metadata).toBeUndefined()
    expect(serialized).not.toContain('secret-approved@example.com')
    expect(serialized).not.toContain('internal intro')
  })

  it('leaves regular users without an elevated role or raw metadata', async () => {
    state.rows = [
      {
        course_name: 'featured-101',
        raw_metadata: makeMetadata({ course_owner: 'owner@example.com' }),
      },
    ]

    const { results } = bodyOf(await fetchFeatured())

    expect(isSuperAdminAsync).toHaveBeenCalledWith(CALLER_EMAIL)
    expect(results[0].userRole).toBeUndefined()
    expect(results[0].metadata).toBeUndefined()
    expect(JSON.stringify(results)).not.toContain('secret-approved@example.com')
  })

  it('keeps the owner role and raw metadata for the owner, even when they are a super admin', async () => {
    isSuperAdminAsync.mockResolvedValue(true)
    state.rows = [
      {
        course_name: 'featured-101',
        raw_metadata: makeMetadata({ course_owner: CALLER_EMAIL }),
      },
    ]

    const { results } = bodyOf(await fetchFeatured())

    expect(results[0]).toMatchObject({ userRole: 'owner', owner: 'You' })
    expect(results[0].metadata).toBeDefined()
  })

  it('keeps the admin role and raw metadata for a listed project admin who is not a super admin', async () => {
    state.rows = [
      {
        course_name: 'featured-101',
        raw_metadata: makeMetadata({
          course_owner: 'owner@example.com',
          course_admins: [CALLER_EMAIL],
        }),
      },
    ]

    const { results } = bodyOf(await fetchFeatured())

    expect(results[0]).toMatchObject({ userRole: 'admin' })
    expect(results[0].metadata).toBeDefined()
  })

  it('resolves super-admin status once per request, not once per card', async () => {
    isSuperAdminAsync.mockResolvedValue(true)
    state.rows = [
      {
        course_name: 'featured-101',
        raw_metadata: makeMetadata({ course_owner: 'a@example.com' }),
      },
      {
        course_name: 'featured-102',
        raw_metadata: makeMetadata({ course_owner: 'b@example.com' }),
      },
      {
        course_name: 'featured-103',
        raw_metadata: makeMetadata({ course_owner: 'c@example.com' }),
      },
    ]

    const { results, total } = bodyOf(await fetchFeatured())

    expect(total).toBe(3)
    expect(results.map((r) => r.userRole)).toEqual(['admin', 'admin', 'admin'])
    expect(isSuperAdminAsync).toHaveBeenCalledTimes(1)
  })
})
