import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => {
  const selectLimit = vi.fn()
  const selectWhere = vi.fn(() => ({ limit: selectLimit }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  const select = vi.fn(() => ({ from: selectFrom }))

  const insertOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const insertValues = vi.fn(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdate,
  }))
  const insert = vi.fn(() => ({ values: insertValues }))

  return {
    db: { select, insert },
    llmConvoMonitor: { convo_id: {}, convo: {} },
    selectLimit,
    insertValues,
    insertOnConflictDoUpdate,
  }
})

vi.mock('~/server/authorization', () => ({
  withCourseAccessFromRequest: () => (h: any) => h,
}))

vi.mock('~/db/dbClient', () => ({
  db: hoisted.db,
}))

vi.mock('~/db/schema', () => ({
  llmConvoMonitor: hoisted.llmConvoMonitor,
}))

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
}))

vi.mock('~/utils/apiUtils', () => ({
  getBackendUrl: () => 'http://backend',
}))

vi.mock('@/utils/sanitization', () => ({
  sanitizeForLogging: (v: any) => v,
}))

const runTreeInstances: any[] = []
vi.mock('langsmith', () => ({
  RunTree: class {
    args: any
    constructor(args: any) {
      this.args = args
      runTreeInstances.push(this)
    }
    end = vi.fn()
    postRun = vi.fn(async () => undefined)
  },
}))

import handler from '~/pages/api/UIUC-api/logConversation'

describe('UIUC-api/logConversation', () => {
  it('returns 400 for missing course_name or missing payload', async () => {
    const res1 = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: {} }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(400)

    const res2 = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: { course_name: 'CS101' } }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(400)
  })

  it('logs a full conversation and returns 200', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          course_name: 'CS101',
          conversation: {
            id: 'c1',
            name: 'n',
            model: { id: 'gpt-4o', name: 'GPT-4o' },
            prompt: 'p',
            temperature: 0.2,
            userEmail: 'u@example.com',
            projectName: 'CS101',
            messages: [
              {
                id: 'm1',
                role: 'user',
                content: [{ type: 'text', text: 'hi' }],
                latestSystemMessage: 'sys',
                finalPromtEngineeredMessage: 'final',
              },
              {
                id: 'm2',
                role: 'assistant',
                content: [{ type: 'text', text: 'ok' }],
              },
            ],
          },
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    expect(hoisted.insertValues).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://backend/llm-monitor-message',
      expect.any(Object),
    )
    expect(runTreeInstances.length).toBeGreaterThan(0)
    fetchSpy.mockRestore()
  })

  const fullConversationBody = {
    course_name: 'CS101',
    conversation: {
      id: 'c1',
      name: 'n',
      model: { id: 'gpt-4o', name: 'GPT-4o' },
      prompt: 'p',
      temperature: 0.2,
      userEmail: 'u@example.com',
      projectName: 'CS101',
      messages: [
        { id: 'm1', role: 'user', content: [{ type: 'text', text: 'hi' }] },
        {
          id: 'm2',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
        },
      ],
    },
  }

  it('returns 500 and logs when the database write fails', async () => {
    hoisted.insertOnConflictDoUpdate.mockRejectedValueOnce(new Error('db down'))
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: fullConversationBody }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Conversation logging failed at step: database',
    })
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*could not save the conversation to the database conversation=c1\nError: db down/,
      ),
    )
    fetchSpy.mockRestore()
    consoleError.mockRestore()
  })

  it('returns 500 and logs status and body when the monitor call fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('monitor broke', { status: 503 }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: fullConversationBody }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Conversation logging failed at step: llm-monitor',
    })
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /ERROR .*backend llm-monitor-message failed conversation=c1 status=503 body=monitor broke/,
      ),
    )
    fetchSpy.mockRestore()
    consoleError.mockRestore()
  })

  it('returns 500 and logs when the monitor call throws', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: fullConversationBody }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(500)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'could not reach the backend llm-monitor-message conversation=c1',
      ),
    )
    fetchSpy.mockRestore()
    consoleError.mockRestore()
  })

  it('merges delta with existing conversation (including edit truncation)', async () => {
    hoisted.selectLimit.mockResolvedValueOnce([
      {
        convo: {
          id: 'c1',
          name: 'n',
          model: { id: 'gpt-4o', name: 'GPT-4o' },
          prompt: 'p',
          temperature: 0.2,
          userEmail: 'u@example.com',
          projectName: 'CS101',
          messages: [
            { id: 'a', role: 'user', content: 'old-1' },
            { id: 'b', role: 'assistant', content: 'old-2' },
            { id: 'c', role: 'user', content: 'old-3' },
          ],
        },
      },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          course_name: 'CS101',
          delta: {
            conversation: {
              id: 'c1',
              name: 'n',
              modelId: 'gpt-4o',
              prompt: 'p',
              temperature: 0.2,
              userEmail: 'u@example.com',
              projectName: 'CS101',
              folderId: null,
            },
            messagesDelta: [
              { id: 'c', role: 'user', content: 'replacement' },
              { id: 'd', role: 'assistant', content: 'new' },
            ],
            earliestEditedMessageId: 'c',
          },
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    const insertArg = hoisted.insertValues.mock.calls.at(-1)?.[0] as any
    expect(insertArg?.convo?.messages?.map((m: any) => m.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    fetchSpy.mockRestore()
  })

  it('saves the delta alone and warns when the existing conversation cannot be read', async () => {
    hoisted.selectLimit.mockRejectedValueOnce(new Error('select failed'))
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          course_name: 'CS101',
          delta: {
            conversation: {
              id: 'c2',
              name: 'n',
              modelId: 'gpt-4o',
              prompt: 'p',
              temperature: 0.2,
              userEmail: 'u@example.com',
              projectName: 'CS101',
              folderId: null,
            },
            messagesDelta: [{ id: 'x', role: 'user', content: 'hi' }],
          },
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringMatching(
        /WARNING api\.logConversation .*could not fetch the existing conversation to merge.* conversation=c2\nError: select failed/,
      ),
    )
    fetchSpy.mockRestore()
    consoleWarn.mockRestore()
  })
})
