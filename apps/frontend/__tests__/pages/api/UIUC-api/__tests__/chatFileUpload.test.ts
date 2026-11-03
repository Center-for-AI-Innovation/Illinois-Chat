/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  uuid: vi.fn(() => 'file-upload-id'),
}))

vi.mock('~/server/authorization', () => ({
  withCourseAccessFromRequest: () => (handler: any) => handler,
}))

vi.mock('~/utils/apiUtils', () => ({
  getBackendUrl: () => 'http://backend',
}))

vi.mock('uuid', () => ({
  v4: hoisted.uuid,
}))

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
}))

vi.mock('~/db/dbClient', () => ({
  db: {
    select: hoisted.select,
    insert: hoisted.insert,
    update: hoisted.update,
  },
  conversations: {
    id: { name: 'id' },
    user_email: { name: 'user_email' },
  },
  fileUploads: {
    id: { name: 'id' },
  },
}))

import handler from '~/pages/api/UIUC-api/chat-file-upload'

describe('UIUC-api chat-file-upload', () => {
  beforeEach(() => {
    hoisted.select.mockReset()
    hoisted.insert.mockReset()
    hoisted.update.mockReset()
    hoisted.uuid.mockClear()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 405 for non-POST', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns 400 when required params are missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: { courseName: 'CS101' } }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 500 when creating a missing conversation fails', async () => {
    hoisted.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValueOnce([]),
        }),
      }),
    }))

    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockRejectedValueOnce(new Error('convFail')),
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          conversationId: 'c1',
          courseName: 'CS101',
          user_id: 'u@example.com',
          s3Key: 'courses/CS101/file.txt',
          fileName: 'file.txt',
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to create conversation',
    })
  })

  it('returns 500 when backend processing is not ok', async () => {
    hoisted.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: vi
            .fn()
            .mockResolvedValueOnce([{ id: 'c1', user_email: 'u@example.com' }]),
        }),
      }),
    }))

    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValueOnce(undefined),
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'boom',
        text: vi.fn(async () => 'error body'),
      })) as any,
    )

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          conversationId: 'c1',
          courseName: 'CS101',
          user_id: 'u@example.com',
          s3Key: 'courses/CS101/file.txt',
          fileName: 'file.txt',
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('returns 200 on success even if updating upload status fails', async () => {
    hoisted.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: vi
            .fn()
            .mockResolvedValueOnce([{ id: 'c1', user_email: 'u@example.com' }]),
        }),
      }),
    }))

    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValueOnce(undefined),
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: vi.fn(async () => ({ chunks_created: 2 })),
      })) as any,
    )

    hoisted.update.mockReturnValueOnce({
      set: () => ({
        where: vi.fn().mockRejectedValueOnce(new Error('updateFail')),
      }),
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          conversationId: 'c1',
          courseName: 'CS101',
          user_id: 'u@example.com',
          s3Key: 'courses/CS101/file.txt',
          fileName: 'file.txt',
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        fileUploadId: 'file-upload-id',
        chunks_created: 2,
      }),
    )
  })

  const body = {
    conversationId: 'c1',
    courseName: 'CS101',
    user_id: 'u@example.com',
    s3Key: 'courses/CS101/file.txt',
    fileName: 'file.txt',
  }
  const existingConversation = () =>
    hoisted.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: vi
            .fn()
            .mockResolvedValueOnce([{ id: 'c1', user_email: 'u@example.com' }]),
        }),
      }),
    }))

  it('returns 500 and logs when the file_uploads insert fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    existingConversation()
    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockRejectedValueOnce(new Error('insert failed')),
    })
    const res = createMockRes()
    await handler(createMockReq({ method: 'POST', body }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*failed to create file_uploads record conversation=c1 file=file\.txt\nError: insert failed/,
      ),
    )
    consoleError.mockRestore()
  })

  it('returns 500 and logs when the backend answer is not JSON', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    existingConversation()
    hoisted.insert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValueOnce(undefined),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: vi.fn(async () => {
          throw new SyntaxError('Unexpected token <')
        }),
      })) as any,
    )
    const res = createMockRes()
    await handler(createMockReq({ method: 'POST', body }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('could not parse the backend response'),
    )
    consoleError.mockRestore()
  })

  it('returns 500 and logs when an unexpected error is thrown', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    hoisted.select.mockImplementationOnce(() => {
      throw new Error('db unavailable')
    })
    const res = createMockRes()
    await handler(createMockReq({ method: 'POST', body }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*chat file upload failed\nError: db unavailable/,
      ),
    )
    consoleError.mockRestore()
  })
})
