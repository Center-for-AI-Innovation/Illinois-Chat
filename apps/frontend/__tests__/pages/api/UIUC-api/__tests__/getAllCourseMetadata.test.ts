import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => {
  const makeDbChain = () => {
    const chain: any = {}
    const methods = [
      'select',
      'from',
      'where',
      'groupBy',
      'limit',
      'orderBy',
      'innerJoin',
      'leftJoin',
    ]
    for (const m of methods) chain[m] = (..._args: unknown[]) => chain
    chain.then = (onFulfilled: any, onRejected?: any) =>
      Promise.resolve([] as unknown[]).then(onFulfilled, onRejected)
    return chain
  }

  return {
    ensureRedisConnected: vi.fn(),
    hGetAll: vi.fn(),
    getBatchProjectTimestamps: vi.fn(
      async () =>
        new Map<
          string,
          { created_at: string | null; last_updated_at: string | null }
        >(),
    ),
    db: makeDbChain(),
  }
})

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: any) => h,
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: hoisted.ensureRedisConnected,
}))

vi.mock('~/utils/projectTimestamps', () => ({
  getBatchProjectTimestamps: hoisted.getBatchProjectTimestamps,
}))

vi.mock('~/db/dbClient', () => ({
  db: hoisted.db,
}))

vi.mock('~/db/schema', () => ({
  conversations: {
    project_name: 'project_name',
    updated_at: 'updated_at',
    user_email: 'user_email',
  },
}))

import handler, {
  getAllCourseMetadata,
  getCoursesByOwnerOrAdmin,
} from '~/pages/api/UIUC-api/getAllCourseMetadata'

describe('UIUC-api/getAllCourseMetadata', () => {
  beforeEach(() => {
    hoisted.ensureRedisConnected.mockReset()
    hoisted.hGetAll.mockReset()
    hoisted.getBatchProjectTimestamps.mockReset()
    hoisted.getBatchProjectTimestamps.mockResolvedValue(new Map())
  })

  it('getCoursesByOwnerOrAdmin filters by owner/admin and ignores invalid JSON', async () => {
    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      hGetAll: hoisted.hGetAll.mockResolvedValueOnce({
        CS101: JSON.stringify({
          course_owner: 'owner@example.com',
          course_admins: [],
        }),
        CS102: JSON.stringify({
          course_owner: 'x@example.com',
          course_admins: ['admin@example.com'],
        }),
        BAD: '{not json',
      }),
    })
    const out = await getCoursesByOwnerOrAdmin('admin@example.com')
    expect(out.length).toBe(1)
  })

  it('getAllCourseMetadata returns [] when redis is empty and parses entries when present', async () => {
    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      hGetAll: hoisted.hGetAll.mockResolvedValueOnce(null),
    })
    await expect(getAllCourseMetadata()).resolves.toEqual([])

    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      hGetAll: hoisted.hGetAll.mockResolvedValueOnce({
        CS101: JSON.stringify({ course_owner: 'x', course_admins: [] }),
      }),
    })
    const out = await getAllCourseMetadata()
    expect(out[0]).toHaveProperty('CS101')
  })

  it('logs the project name, never the stored value, for invalid JSON', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      hGetAll: hoisted.hGetAll.mockResolvedValueOnce({
        BAD: '{"openai_api_key":"sk-secret"',
      }),
    })
    await getCoursesByOwnerOrAdmin('admin@example.com')
    const lines = consoleError.mock.calls.map((c) => String(c[0]))
    expect(lines.some((l) => l.includes('invalid course metadata'))).toBe(true)
    expect(lines.some((l) => l.includes('project=BAD'))).toBe(true)
    expect(lines.join('\n')).not.toContain('sk-secret')
    consoleError.mockRestore()
  })

  it('returns [] and logs without dumping metadata when Redis fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    hoisted.ensureRedisConnected.mockRejectedValueOnce(new Error('redis down'))
    await expect(getCoursesByOwnerOrAdmin('a@example.com')).resolves.toEqual([])
    hoisted.ensureRedisConnected.mockRejectedValueOnce(new Error('redis down'))
    await expect(getAllCourseMetadata()).resolves.toEqual([])

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*error fetching the projects of a user\nError: redis down/,
      ),
    )
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*error fetching all course metadata\nError: redis down/,
      ),
    )
    consoleError.mockRestore()
  })

  it('still returns projects when the last-access lookup fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const originalThen = hoisted.db.then
    hoisted.db.then = (_ok: any, onRejected?: any) =>
      Promise.reject(new Error('pg down')).then(undefined, onRejected)
    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      hGetAll: hoisted.hGetAll.mockResolvedValueOnce({
        CS101: JSON.stringify({
          course_owner: 'owner@example.com',
          course_admins: [],
        }),
      }),
    })
    try {
      const out = await getCoursesByOwnerOrAdmin('owner@example.com')
      expect(out.length).toBe(1)
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('could not fetch last access timestamps'),
      )
    } finally {
      hoisted.db.then = originalThen
      consoleWarn.mockRestore()
    }
  })

  it('handler returns 400 without email and 200 with data', async () => {
    const res1 = createMockRes()
    await handler(
      createMockReq({ method: 'GET', user: {} }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(400)

    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      hGetAll: hoisted.hGetAll.mockResolvedValueOnce({
        CS101: JSON.stringify({
          course_owner: 'owner@example.com',
          course_admins: [],
        }),
      }),
    })
    const res2 = createMockRes()
    await handler(
      createMockReq({
        method: 'GET',
        user: { email: 'owner@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
  })
})
