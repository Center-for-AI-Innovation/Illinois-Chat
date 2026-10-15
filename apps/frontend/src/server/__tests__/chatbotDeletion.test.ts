/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => {
  const projectRows = vi.fn()
  const insertReturning = vi.fn()
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const updateReturning = vi.fn()
  const updateSet = vi.fn(() => ({
    where: () => ({ returning: updateReturning }),
  }))
  const deleteWhere = vi.fn()

  const db = {
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: projectRows }) }),
    })),
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => ({ set: updateSet })),
    delete: vi.fn(() => ({ where: deleteWhere })),
  }

  return {
    db,
    projectRows,
    insertValues,
    insertReturning,
    updateSet,
    updateReturning,
    deleteWhere,
    deleteCourseMetadata: vi.fn(),
    redisDel: vi.fn(),
  }
})

vi.mock('drizzle-orm', () => ({
  and: () => ({}),
  desc: () => ({}),
  eq: () => ({}),
  ne: () => ({}),
}))

vi.mock('~/db/dbClient', () => ({
  db: hoisted.db,
  projectDeletions: { id: {}, project_name: {}, status: {} },
  projectExternalConnections: {},
  projects: { id: {}, course_name: {} },
}))

vi.mock('~/utils/apiUtils', () => ({
  getBackendUrl: () => 'http://backend',
}))

vi.mock('~/utils/courseMetadataStore', () => ({
  deleteCourseMetadata: hoisted.deleteCourseMetadata,
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: async () => ({ del: hoisted.redisDel }),
}))

import {
  ChatbotDeletionConflictError,
  getExternalStores,
  startChatbotDeletion,
} from '~/server/chatbotDeletion'

const metadata = { course_owner: 'o@illinois.edu' } as any
const row = { id: 9, project_name: 'bot', status: 'pending' }

function start() {
  return startChatbotDeletion({
    courseName: 'bot',
    metadata,
    requestedBy: 'o@illinois.edu',
    includeExternal: false,
  })
}

describe('startChatbotDeletion', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.projectRows.mockResolvedValue([{ id: 3 }])
    hoisted.insertReturning.mockResolvedValue([row])
    hoisted.deleteCourseMetadata.mockResolvedValue(undefined)
    hoisted.redisDel.mockResolvedValue(1)
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 202 }))
  })

  it('records the row, hides the chatbot, then queues the purge', async () => {
    const result = await start()

    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        project_name: 'bot',
        project_id: 3,
        requested_by: 'o@illinois.edu',
        include_external: false,
        metadata_backup: metadata,
      }),
    )
    expect(hoisted.deleteCourseMetadata).toHaveBeenCalledWith('bot')
    expect(hoisted.redisDel).toHaveBeenCalledWith('bot-llms')
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://backend/deleteProject',
      expect.objectContaining({ body: JSON.stringify({ deletion_id: 9 }) }),
    )
    expect(result).toEqual({ deletion: row, queued: true })
    // Ordering: nothing is hidden before the row exists.
    expect(hoisted.insertValues.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.deleteCourseMetadata.mock.invocationCallOrder[0]!,
    )
  })

  it('maps the active-name unique violation to a conflict', async () => {
    hoisted.insertReturning.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: '23505' }),
    )
    await expect(start()).rejects.toBeInstanceOf(ChatbotDeletionConflictError)
    expect(hoisted.deleteCourseMetadata).not.toHaveBeenCalled()
  })

  it('drops the row when the metadata cannot be removed', async () => {
    hoisted.deleteCourseMetadata.mockRejectedValueOnce(new Error('redis down'))
    await expect(start()).rejects.toThrow('redis down')
    expect(hoisted.deleteCourseMetadata).toHaveBeenCalled()
    expect(hoisted.deleteWhere).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps the chatbot hidden and marks the row failed when queueing fails', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 503 }))
    hoisted.updateReturning.mockResolvedValueOnce([
      { ...row, status: 'failed' },
    ])

    const result = await start()

    expect(result.queued).toBe(false)
    expect(result.deletion.status).toBe('failed')
    expect(hoisted.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('503'),
      }),
    )
    expect(hoisted.deleteWhere).not.toHaveBeenCalled()
  })
})

describe('getExternalStores', () => {
  it('lists only the configured kinds', async () => {
    hoisted.projectRows.mockResolvedValueOnce([
      { database: { encrypted: 'x' }, qdrant: null, s3: { encrypted: 'y' } },
    ])
    expect(await getExternalStores('bot')).toEqual(['database', 's3'])

    hoisted.projectRows.mockResolvedValueOnce([])
    expect(await getExternalStores('bot')).toEqual([])
  })
})
