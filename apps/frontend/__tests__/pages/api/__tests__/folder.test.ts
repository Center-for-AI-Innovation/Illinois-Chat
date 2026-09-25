/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => {
  const insert = vi.fn()
  const del = vi.fn()
  const findMany = vi.fn()

  // db.select().from().where() is used for subqueries, and the same chain with
  // .orderBy().limit() resolves a course name to its projects.id.
  const projectRows = vi.fn(async () => [{ id: 42 }])
  const selectLimit = vi.fn(() => projectRows())
  const selectOrderBy = vi.fn(() => ({ limit: selectLimit }))
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  const selectLeftJoin = vi.fn(() => ({ leftJoin: selectFrom }))
  const select = vi.fn(() => ({ from: selectFrom }))
  const selectDistinct = vi.fn(() => ({ from: selectLeftJoin }))

  const folders = {
    id: { name: 'id' },
    user_email: { name: 'user_email' },
    project_id: { name: 'project_id' },
    created_at: { name: 'created_at' },
    name: { name: 'name' },
  }

  const projects = {
    id: { name: 'id' },
    course_name: { name: 'course_name' },
  }

  const messages = {
    id: { name: 'id' },
    conversation_id: { name: 'conversation_id' },
    created_at: { name: 'created_at' },
  }

  const conversations = {
    id: { name: 'id' },
    user_email: { name: 'user_email' },
    project_name: { name: 'project_name' },
    folder_id: { name: 'folder_id' },
  }

  const db = {
    insert,
    delete: del,
    select,
    selectDistinct,
    query: {
      folders: { findMany },
    },
  }

  return {
    db,
    folders,
    projects,
    insert,
    del,
    findMany,
    messages,
    conversations,
    projectRows,
  }
})

vi.mock('~/server/authorization', () => ({
  withCourseAccessFromRequest: () => (h: any) => h,
}))

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
  desc: () => ({}),
  and: () => ({}),
  or: () => ({}),
  inArray: () => ({}),
  ilike: () => ({}),
}))

vi.mock('~/db/dbClient', () => ({
  db: hoisted.db,
  folders: hoisted.folders,
  projects: hoisted.projects,
  conversations: hoisted.conversations,
  messages: hoisted.messages,
}))

vi.mock('~/pages/api/conversation', () => ({
  convertDBToChatConversation: vi.fn(() => ({ id: 'c1', messages: [] })),
}))

import handler from '~/pages/api/folder'

describe('folder API', () => {
  it('returns 400 when no user identifier is present', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('POST upserts folder and returns 200', async () => {
    const values = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'f1' }]),
      }),
    })
    hoisted.insert.mockReturnValueOnce({ values })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        user: { email: 'u@example.com' },
        courseName: 'TEST101',
        body: { folder: { id: 'f1', name: 'Folder', type: 'chat' } },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    // The folder is stored against the resolved projects.id, not the raw
    // course name, so it can be filtered per course on read.
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1', project_id: 42 }),
    )
  })

  it('POST returns 400 when courseName is missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        user: { email: 'u@example.com' },
        body: { folder: { id: 'f1', name: 'Folder', type: 'chat' } },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('POST returns 404 when the project does not exist', async () => {
    hoisted.projectRows.mockResolvedValueOnce([])

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        user: { email: 'u@example.com' },
        courseName: 'NOPE',
        body: { folder: { id: 'f1', name: 'Folder', type: 'chat' } },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(404)
    expect(hoisted.insert).not.toHaveBeenCalled()
  })

  it('POST returns 403 when the folder belongs to another user', async () => {
    // onConflictDoUpdate is scoped to the owner, so a colliding id owned by
    // someone else updates nothing.
    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        user: { email: 'u@example.com' },
        courseName: 'TEST101',
        body: { folder: { id: 'f1', name: 'Folder', type: 'chat' } },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('POST returns 500 when db insert fails', async () => {
    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('boom')),
        }),
      }),
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        user: { email: 'u@example.com' },
        courseName: 'TEST101',
        body: { folder: { id: 'f1', name: 'Folder', type: 'chat' } },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('GET returns 400 when courseName is missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'GET',
        user: { email: 'u@example.com' },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'courseName query parameter is required',
    })
  })

  it('GET returns folders', async () => {
    hoisted.findMany.mockResolvedValueOnce([
      {
        id: 'f1',
        name: 'Folder',
        type: 'chat',
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-02T00:00:00Z'),
        conversations: [{ id: 'c1', messages: [] }],
      },
    ])

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'GET',
        user: { email: 'u@example.com' },
        courseName: 'TEST101',
        query: { courseName: 'TEST101' },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    const body = (res.json as any).mock.calls[0]?.[0]
    expect(body[0]).toMatchObject({ id: 'f1', name: 'Folder', type: 'chat' })
    const findManyArg = hoisted.findMany.mock.calls[0]?.[0]
    expect(
      findManyArg?.with?.conversations?.with?.messages?.columns
        ?.processed_content,
    ).toBe(true)
  })

  it('GET returns a folder that has no conversations in this course', async () => {
    // Folder membership is decided by folders.project_id alone. An empty
    // folder in the current course must still be listed; the old code returned
    // [] for the whole response whenever nothing matched.
    hoisted.findMany.mockResolvedValueOnce([
      {
        id: 'f1',
        name: 'Empty Folder',
        type: 'chat',
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-02T00:00:00Z'),
        conversations: [],
      },
    ])

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'GET',
        user: { email: 'u@example.com' },
        courseName: 'TEST101',
        query: { courseName: 'TEST101' },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    const body = (res.json as any).mock.calls[0]?.[0]
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: 'f1', conversations: [] })
  })

  it('GET returns 404 when the project does not exist', async () => {
    hoisted.projectRows.mockResolvedValueOnce([])

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'GET',
        user: { email: 'u@example.com' },
        courseName: 'NOPE',
        query: { courseName: 'NOPE' },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(404)
    expect(hoisted.findMany).not.toHaveBeenCalled()
  })

  it('DELETE returns 400 when deletedFolderId is missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'DELETE',
        user: { email: 'u@example.com' },
        body: {},
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('DELETE returns 403 when folder does not belong to user', async () => {
    hoisted.del.mockReturnValueOnce({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'DELETE',
        user: { email: 'u@example.com' },
        body: { deletedFolderId: 'f1' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('DELETE returns 200 when folder is deleted', async () => {
    hoisted.del.mockReturnValueOnce({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'f1' }]),
      }),
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'DELETE',
        user: { email: 'u@example.com' },
        body: { deletedFolderId: 'f1' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'PUT', user: { email: 'u@example.com' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(405)
  })
})
