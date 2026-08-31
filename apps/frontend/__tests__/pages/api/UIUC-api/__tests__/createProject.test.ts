import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => {
  return {
    checkCourseExists: vi.fn(),
    writeCourseMetadata: vi.fn(),
    insertValues: vi.fn(),
    selectFrom: vi.fn(),
    redisSet: vi.fn(),
    encryptKeyIfNeeded: vi.fn(async (k: string) => `enc:${k}`),
  }
})

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: any) => h,
}))

vi.mock('~/pages/api/UIUC-api/getCourseExists', () => ({
  checkCourseExists: hoisted.checkCourseExists,
}))

vi.mock('~/utils/courseMetadataStore', () => ({
  writeCourseMetadata: hoisted.writeCourseMetadata,
}))

vi.mock('~/utils/crypto', () => ({
  encryptKeyIfNeeded: hoisted.encryptKeyIfNeeded,
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(async () => ({ set: hoisted.redisSet })),
}))

vi.mock('~/utils/superAdmins', () => ({
  superAdmins: ['admin@example.com'],
}))

vi.mock('~/db/schema', () => ({
  projects: {},
  preAuthorizedApiKeys: {},
}))

vi.mock('~/db/dbClient', () => ({
  db: {
    insert: () => ({ values: hoisted.insertValues }),
    select: () => ({ from: hoisted.selectFrom }),
  },
}))

import handler from '~/pages/api/UIUC-api/createProject'

describe('UIUC-api/createProject', () => {
  it('returns 405 for non-POST', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns 400 for missing required fields', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: { project_name: 'x' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 409 when project exists and 503 when existence check fails', async () => {
    hoisted.checkCourseExists.mockResolvedValueOnce(true)
    const res1 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(409)

    hoisted.checkCourseExists.mockRejectedValueOnce(new Error('redis down'))
    const res2 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(503)
  })

  it('writes Redis+Postgres metadata and returns 200', async () => {
    hoisted.checkCourseExists.mockResolvedValueOnce(false)
    hoisted.writeCourseMetadata.mockResolvedValueOnce(undefined)
    hoisted.insertValues.mockResolvedValueOnce(undefined)
    hoisted.selectFrom.mockResolvedValueOnce([])

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          project_name: 'x',
          project_description: 'desc',
          project_owner_email: 'o@example.com',
          is_private: true,
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(hoisted.writeCourseMetadata).toHaveBeenCalledWith(
      'x',
      expect.objectContaining({
        course_owner: 'o@example.com',
        is_private: true,
        project_description: 'desc',
        course_admins: ['admin@example.com'],
      }),
    )
  })

  it('returns 500 when metadata write fails and still 200 when projects insert fails', async () => {
    hoisted.checkCourseExists.mockResolvedValueOnce(false)
    hoisted.writeCourseMetadata.mockRejectedValueOnce(new Error('write failed'))
    const res1 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(500)

    hoisted.checkCourseExists.mockResolvedValueOnce(false)
    hoisted.writeCourseMetadata.mockResolvedValueOnce(undefined)
    hoisted.insertValues.mockRejectedValueOnce(new Error('insert failed'))
    hoisted.selectFrom.mockResolvedValueOnce([])
    const res2 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
  })

  it('seeds encrypted pre-assigned LLM keys into Redis', async () => {
    hoisted.checkCourseExists.mockResolvedValueOnce(false)
    hoisted.writeCourseMetadata.mockResolvedValueOnce(undefined)
    hoisted.insertValues.mockResolvedValueOnce(undefined)
    hoisted.selectFrom.mockResolvedValueOnce([
      {
        emails: ['o@example.com'],
        providerName: 'OpenAI',
        providerBodyNoModels: { apiKey: 'sk-raw' },
      },
      {
        emails: ['other@example.com'],
        providerName: 'Anthropic',
        providerBodyNoModels: { apiKey: 'sk-other' },
      },
    ])

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(hoisted.encryptKeyIfNeeded).toHaveBeenCalledWith('sk-raw')
    expect(hoisted.redisSet).toHaveBeenCalledWith(
      'x-llms',
      expect.stringContaining('enc:sk-raw'),
    )
  })

  it('still returns 200 when pre-assigned LLM key seeding fails', async () => {
    hoisted.checkCourseExists.mockResolvedValueOnce(false)
    hoisted.writeCourseMetadata.mockResolvedValueOnce(undefined)
    hoisted.insertValues.mockResolvedValueOnce(undefined)
    hoisted.selectFrom.mockRejectedValueOnce(new Error('keys down'))

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { project_name: 'x', project_owner_email: 'o@example.com' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
