/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => {
  // Mutable so individual tests can drive the drizzle query result (or make it
  // reject) without rebuilding the chain.
  const dbState: { rows: unknown[]; error: Error | null } = {
    rows: [],
    error: null,
  }

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
      (dbState.error
        ? Promise.reject(dbState.error)
        : Promise.resolve(dbState.rows)
      ).then(onFulfilled, onRejected)
    return chain
  }

  return {
    dbState,
    hGet: vi.fn(),
    hGetAll: vi.fn(),
    hExists: vi.fn(),
    getProjectTimestamps: vi.fn(async () => ({
      created_at: null,
      last_updated_at: null,
    })),
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
  withAuth: (fn: any) => fn,
}))

vi.mock('~/pages/api/authorization', () => ({
  withCourseAccessFromRequest: () => (handler: any) => handler,
  withCourseOwnerOrAdminAccess: () => (handler: any) => handler,
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(async () => ({
    hGet: hoisted.hGet,
    hGetAll: hoisted.hGetAll,
    hExists: hoisted.hExists,
  })),
}))

vi.mock('~/utils/projectTimestamps', () => ({
  getProjectTimestamps: hoisted.getProjectTimestamps,
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

import getAllCourseMetadataHandler, {
  getAllCourseMetadata,
  getCoursesByOwnerOrAdmin,
} from '~/pages/api/UIUC-api/getAllCourseMetadata'
import getAllCourseNamesHandler from '~/pages/api/UIUC-api/getAllCourseNames'
import getCourseExistsHandler, {
  checkCourseExists,
} from '~/pages/api/UIUC-api/getCourseExists'
import getCourseMetadataHandler, {
  getCourseMetadata,
  getUserLastAccessForCourse,
} from '~/pages/api/UIUC-api/getCourseMetadata'

describe('UIUC-api course metadata routes', () => {
  beforeEach(() => {
    hoisted.hGet.mockReset()
    hoisted.hGetAll.mockReset()
    hoisted.hExists.mockReset()
    hoisted.getProjectTimestamps.mockReset()
    hoisted.getProjectTimestamps.mockResolvedValue({
      created_at: null,
      last_updated_at: null,
    })
    hoisted.getBatchProjectTimestamps.mockReset()
    hoisted.getBatchProjectTimestamps.mockResolvedValue(new Map())
    hoisted.dbState.rows = []
    hoisted.dbState.error = null
  })

  it('getCourseMetadata returns parsed metadata or null', async () => {
    hoisted.hGet.mockResolvedValueOnce(
      JSON.stringify({ is_private: false, course_owner: 'owner@example.com' }),
    )
    await expect(getCourseMetadata('CS101')).resolves.toMatchObject({
      is_private: false,
      course_owner: 'owner@example.com',
    })

    hoisted.hGet.mockResolvedValueOnce(null)
    await expect(getCourseMetadata('CS101')).resolves.toBeNull()

    hoisted.hGet.mockRejectedValueOnce(new Error('boom'))
    await expect(getCourseMetadata('CS101')).resolves.toBeNull()
  })

  it('getCourseMetadata handler returns 404 when course is missing', async () => {
    hoisted.hGet.mockResolvedValueOnce(null)
    const res = createMockRes()
    await getCourseMetadataHandler(
      createMockReq({ method: 'GET', query: { course_name: 'CS101' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('getCourseMetadata handler returns 200 with metadata', async () => {
    hoisted.hGet.mockResolvedValueOnce(JSON.stringify({ is_private: true }))
    const res = createMockRes()
    await getCourseMetadataHandler(
      createMockReq({ method: 'GET', query: { course_name: 'CS101' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        course_metadata: expect.objectContaining({ is_private: true }),
      }),
    )
  })

  it('getUserLastAccessForCourse returns the latest timestamp as ISO', async () => {
    hoisted.dbState.rows = [
      { lastAccessedAt: new Date('2026-03-04T05:06:07.000Z') },
    ]
    await expect(
      getUserLastAccessForCourse('me@example.com', 'CS101'),
    ).resolves.toBe('2026-03-04T05:06:07.000Z')
  })

  it('getUserLastAccessForCourse returns null when there are no conversations', async () => {
    hoisted.dbState.rows = []
    await expect(
      getUserLastAccessForCourse('me@example.com', 'CS101'),
    ).resolves.toBeNull()

    hoisted.dbState.rows = [{ lastAccessedAt: null }]
    await expect(
      getUserLastAccessForCourse('me@example.com', 'CS101'),
    ).resolves.toBeNull()
  })

  it('getUserLastAccessForCourse returns null when the query fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    hoisted.dbState.error = new Error('db down')
    await expect(
      getUserLastAccessForCourse('me@example.com', 'CS101'),
    ).resolves.toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('getCourseMetadata handler includes last_accessed_at for the caller', async () => {
    hoisted.hGet.mockResolvedValueOnce(JSON.stringify({ is_private: false }))
    hoisted.dbState.rows = [
      { lastAccessedAt: new Date('2026-01-02T03:04:05.000Z') },
    ]

    const res = createMockRes()
    await getCourseMetadataHandler(
      createMockReq({
        method: 'GET',
        query: { course_name: 'CS101' },
        user: { email: 'me@example.com' },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        last_accessed_at: '2026-01-02T03:04:05.000Z',
      }),
    )
  })

  it('getCourseMetadata handler returns 500 when the response fails to serialize', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    hoisted.hGet.mockResolvedValueOnce(JSON.stringify({ is_private: false }))

    const res = createMockRes()
    res.json.mockImplementationOnce(() => {
      throw new Error('serialize boom')
    })

    await getCourseMetadataHandler(
      createMockReq({ method: 'GET', query: { course_name: 'CS101' } }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenLastCalledWith(500)
    spy.mockRestore()
  })

  it('getCoursesByOwnerOrAdmin filters metadata based on owner/admin', async () => {
    hoisted.hGetAll.mockResolvedValueOnce({
      CS101: JSON.stringify({
        course_owner: 'me@example.com',
        course_admins: [],
      }),
      CS102: JSON.stringify({
        course_owner: 'someone@example.com',
        course_admins: ['me@example.com'],
      }),
      BAD: 'not-json',
    })

    const result = await getCoursesByOwnerOrAdmin('me@example.com')
    expect(result).toHaveLength(2)
    expect(Object.keys(result[0] ?? {})[0]).toBe('CS101')
    expect(Object.keys(result[1] ?? {})[0]).toBe('CS102')
  })

  it('getCoursesByOwnerOrAdmin skips frozen projects', async () => {
    hoisted.hGetAll.mockResolvedValueOnce({
      CS101: JSON.stringify({
        course_owner: 'me@example.com',
        course_admins: [],
      }),
      CS102: JSON.stringify({
        course_owner: 'me@example.com',
        course_admins: [],
        is_frozen: true,
      }),
    })

    const result = await getCoursesByOwnerOrAdmin('me@example.com')
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty('CS101')
  })

  it('getCoursesByOwnerOrAdmin enriches entries with last_accessed_at', async () => {
    hoisted.hGetAll.mockResolvedValueOnce({
      CS101: JSON.stringify({
        course_owner: 'me@example.com',
        course_admins: [],
      }),
      CS102: JSON.stringify({
        course_owner: 'me@example.com',
        course_admins: [],
      }),
    })
    hoisted.dbState.rows = [
      {
        projectName: 'CS101',
        lastAccessedAt: new Date('2026-02-03T04:05:06.000Z'),
      },
      { projectName: 'CS102', lastAccessedAt: null },
    ]

    const result = await getCoursesByOwnerOrAdmin('me@example.com')
    expect(result[0]?.CS101).toMatchObject({
      last_accessed_at: '2026-02-03T04:05:06.000Z',
    })
    expect(result[1]?.CS102).toMatchObject({ last_accessed_at: null })
  })

  it('getCoursesByOwnerOrAdmin still returns metadata when the last-access query fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    hoisted.hGetAll.mockResolvedValueOnce({
      CS101: JSON.stringify({
        course_owner: 'me@example.com',
        course_admins: [],
      }),
    })
    hoisted.dbState.error = new Error('db down')

    const result = await getCoursesByOwnerOrAdmin('me@example.com')
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty('CS101')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('getCoursesByOwnerOrAdmin returns [] when redis has nothing or fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    hoisted.hGetAll.mockResolvedValueOnce(null)
    await expect(getCoursesByOwnerOrAdmin('me@example.com')).resolves.toEqual(
      [],
    )

    hoisted.hGetAll.mockRejectedValueOnce(new Error('redis down'))
    await expect(getCoursesByOwnerOrAdmin('me@example.com')).resolves.toEqual(
      [],
    )

    spy.mockRestore()
  })

  it('getAllCourseMetadata skips frozen projects', async () => {
    hoisted.hGetAll.mockResolvedValueOnce({
      CS101: JSON.stringify({ is_private: false }),
      CS102: JSON.stringify({ is_private: false, is_frozen: true }),
    })

    const all = await getAllCourseMetadata()
    expect(all).toHaveLength(1)
    expect(all[0]).toHaveProperty('CS101')
  })

  it('getAllCourseMetadata returns [] when redis has nothing or fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    hoisted.hGetAll.mockResolvedValueOnce(null)
    await expect(getAllCourseMetadata()).resolves.toEqual([])

    hoisted.hGetAll.mockResolvedValueOnce({ CS101: 'not-json' })
    await expect(getAllCourseMetadata()).resolves.toEqual([])

    spy.mockRestore()
  })

  it('getAllCourseMetadata handler returns 500 when the response fails to serialize', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    hoisted.hGetAll.mockResolvedValueOnce({})

    const res = createMockRes()
    res.json.mockImplementationOnce(() => {
      throw new Error('serialize boom')
    })

    await getAllCourseMetadataHandler(
      createMockReq({ user: { email: 'me@example.com' } }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenLastCalledWith(500)
    spy.mockRestore()
  })

  it('getAllCourseMetadata returns all entries when redis has data', async () => {
    hoisted.hGetAll.mockResolvedValueOnce({
      CS101: JSON.stringify({ is_private: false }),
      CS102: JSON.stringify({ is_private: true }),
    })

    const all = await getAllCourseMetadata()
    expect(all).toHaveLength(2)
    expect(all[0]).toHaveProperty('CS101')
    expect(all[1]).toHaveProperty('CS102')
  })

  it('getAllCourseMetadata handler returns 400 when user email is missing', async () => {
    const res = createMockRes()
    await getAllCourseMetadataHandler(
      createMockReq({ user: null }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('getAllCourseMetadata handler returns 200 for user-owned/admin courses', async () => {
    hoisted.hGetAll.mockResolvedValueOnce({
      CS101: JSON.stringify({
        course_owner: 'me@example.com',
        course_admins: [],
      }),
    })

    const res = createMockRes()
    await getAllCourseMetadataHandler(
      createMockReq({ user: { email: 'me@example.com' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('getAllCourseNames returns 400 when email is missing and 200 with course names', async () => {
    const res1 = createMockRes()
    await getAllCourseNamesHandler(
      createMockReq({ user: null }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(400)

    hoisted.hGetAll.mockResolvedValueOnce({
      CS101: JSON.stringify({
        course_owner: 'me@example.com',
        course_admins: [],
      }),
    })
    const res2 = createMockRes()
    await getAllCourseNamesHandler(
      createMockReq({ user: { email: 'me@example.com' } }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
    expect(res2.json).toHaveBeenCalledWith({ all_course_names: ['CS101'] })
  })

  it('checkCourseExists returns boolean and handler returns false on failure', async () => {
    hoisted.hExists.mockResolvedValueOnce(true)
    await expect(checkCourseExists('CS101')).resolves.toBe(true)

    hoisted.hExists.mockResolvedValueOnce(false)
    await expect(checkCourseExists('CS101')).resolves.toBe(false)

    const res1 = createMockRes()
    hoisted.hExists.mockResolvedValueOnce(true)
    await getCourseExistsHandler(
      createMockReq({ query: { course_name: 'CS101' } }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(200)
    expect(res1.json).toHaveBeenCalledWith(true)

    const res2 = createMockRes()
    hoisted.hExists.mockRejectedValueOnce(new Error('boom'))
    await getCourseExistsHandler(
      createMockReq({ query: { course_name: 'CS101' } }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(500)
    expect(res2.json).toHaveBeenCalledWith(false)
  })
})
