// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  getModels: vi.fn(),
  metadata: vi.fn(),
  resolve: vi.fn(),
  streamText: vi.fn(),
  fetchContexts: vi.fn(),
  fetchTools: vi.fn(),
  executeTool: vi.fn(),
  access: vi.fn(() => (handler: unknown) => handler),
}))
vi.mock('~/app/api/authorization', () => ({
  withCourseAccessFromRequest: mocks.access,
  getCourseMetadata: mocks.metadata,
}))
vi.mock('~/pages/api/models', () => ({ getModels: mocks.getModels }))
vi.mock('~/server/chat/workspaceModel', () => ({
  resolveWorkspaceModel: mocks.resolve,
}))
vi.mock('~/server/agent/agentServerUtils', () => ({
  fetchContextsServer: mocks.fetchContexts,
  fetchToolsServer: mocks.fetchTools,
  executeToolServer: mocks.executeTool,
}))
vi.mock('ai', async () => ({
  ...(await vi.importActual<typeof import('ai')>('ai')),
  streamText: mocks.streamText,
}))
import { POST } from '../route'
import { type AuthenticatedRequest } from '~/utils/appRouterAuth'
import { countTokens, messagesTokens } from '~/server/chat/contextBudget'
import {
  DOCUMENT_FOCUS_PROMPT,
  GUIDED_LEARNING_PROMPT,
} from '~/utils/app/const'

const messages = [
  { id: 'm', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
]
function request(body: unknown) {
  return new Request('http://localhost/api/chat/workspace', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as AuthenticatedRequest
}
beforeEach(() => {
  mocks.getModels.mockResolvedValue({
    OpenAI: {
      provider: 'OpenAI',
      enabled: true,
      models: [{ id: 'gpt-5.4', enabled: true, tokenLimit: 128000 }],
    },
  })
  mocks.metadata.mockResolvedValue({
    system_prompt: 'Project instructions',
    disableCitations: false,
  })
  mocks.resolve.mockResolvedValue({ modelId: 'gpt-5.4' })
  mocks.fetchTools.mockResolvedValue([])
  mocks.fetchContexts.mockResolvedValue([])
  mocks.streamText.mockImplementation(() => ({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'start' })
        controller.enqueue({ type: 'text-start', id: 't' })
        controller.enqueue({ type: 'text-delta', id: 't', text: 'answer' })
        controller.enqueue({ type: 'text-end', id: 't' })
        controller.enqueue({
          type: 'finish-step',
          finishReason: 'stop',
          usage: { inputTokens: 1200, outputTokens: 300 },
        })
        controller.enqueue({
          type: 'finish',
          finishReason: 'stop',
          totalUsage: { inputTokens: 1200, outputTokens: 300 },
        })
        controller.close()
      },
    }),
  }))
})

describe('structured workspace route', () => {
  it('rejects unavailable models without starting generation', async () => {
    mocks.resolve.mockRejectedValueOnce(new Error('Model is not enabled'))
    const response = await POST(
      request({ messages, course_name: 'CS124', modelId: 'disabled' }),
    )
    expect(response.status).toBe(400)
    expect(mocks.streamText).not.toHaveBeenCalled()
  })
  it('rejects incomplete requests before resolving providers', async () => {
    const response = await POST(request({ messages }))
    expect(response.status).toBe(400)
    expect(mocks.resolve).not.toHaveBeenCalled()
  })
  it('uses server-side project configuration and streams SDK UI events', async () => {
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        knowledge: false,
      }),
    )
    expect(response).toBeInstanceOf(NextResponse)
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1')
    expect(await response.text()).toContain('text-delta')
    expect(mocks.getModels).toHaveBeenCalledWith('CS124')
    const options = mocks.streamText.mock.calls[0]![0]
    expect(options.instructions).toContain('Project instructions')
    expect(options.providerOptions.openai).toMatchObject({
      reasoningSummary: 'auto',
      store: false,
    })
    expect(options.tools.searchDocuments).toBeUndefined()
    expect(options.tools.updatePlan).toBeDefined()
    expect(options.tools.createArtifact).toBeDefined()
  })
  it('streams token usage as message metadata for the context meter', async () => {
    const response = await POST(
      request({ messages, course_name: 'CS124', modelId: 'gpt-5.4' }),
    )
    const body = await response.text()
    expect(body).toContain('"modelId":"gpt-5.4"')
    expect(body).toContain('"contextTokens":1500')
    expect(body).toContain('"inputTokens":1200')
  })
  it('searches only the enabled document groups', async () => {
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        documentGroups: ['Lectures'],
      }),
    )
    await response.text()
    const search = mocks.streamText.mock.calls[0]![0].tools.searchDocuments
    await search.execute({ query: 'recursion' }, { abortSignal: undefined })
    expect(mocks.fetchContexts).toHaveBeenCalledWith(
      expect.objectContaining({ docGroups: ['Lectures'] }),
    )
  })
  it('keeps every passage that fits the model context budget', async () => {
    mocks.getModels.mockResolvedValue({
      OpenAI: {
        provider: 'OpenAI',
        enabled: true,
        models: [{ id: 'gpt-5.4', enabled: true, tokenLimit: 3500 }],
      },
    })
    mocks.fetchContexts.mockResolvedValue(
      Array.from({ length: 40 }, (_, index) => ({
        readable_filename: `Doc ${index}.pdf`,
        text: 'word '.repeat(80),
      })),
    )
    const response = await POST(
      request({ messages, course_name: 'CS124', modelId: 'gpt-5.4' }),
    )
    await response.text()
    const output = mocks.streamText.mock.calls[0]![0].messages.at(-1).content[0]
      .output.value as { sources: unknown[] }
    expect(output.sources.length).toBeGreaterThan(8)
    expect(output.sources.length).toBeLessThan(40)
  })
  it('grounds each new question in a document search before the model runs', async () => {
    mocks.fetchContexts.mockResolvedValue([
      {
        readable_filename: 'Week 1.pdf',
        text: 'Recursion basics',
        url: 'https://example.com/week1',
        pagenumber: '3',
      },
    ])
    const response = await POST(
      request({ messages, course_name: 'CS124', modelId: 'gpt-5.4' }),
    )
    const body = await response.text()
    expect(mocks.fetchContexts).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: 'hello' }),
    )
    expect(body).toContain('"toolName":"searchDocuments"')
    expect(body).toContain('Week 1.pdf')
    const history = mocks.streamText.mock.calls[0]![0].messages
    expect(history.at(-1)).toMatchObject({
      role: 'tool',
      content: [
        {
          toolName: 'searchDocuments',
          output: {
            type: 'json',
            value: { sources: [{ title: 'Week 1.pdf' }] },
          },
        },
      ],
    })
  })
  it('skips the grounding search when knowledge is off', async () => {
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        knowledge: false,
      }),
    )
    await response.text()
    expect(mocks.fetchContexts).not.toHaveBeenCalled()
  })
  it('exposes enabled project workflows and skips disabled ones', async () => {
    mocks.fetchTools.mockResolvedValue([
      {
        id: 'w1',
        name: 'weather',
        readableName: 'Weather',
        description: 'Forecast',
      },
      { id: 'w2', name: 'grades', readableName: 'Grades', description: 'x' },
    ])
    mocks.executeTool.mockResolvedValue({ output: { text: 'Sunny' } })
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        disabledToolIds: ['w2'],
      }),
    )
    await response.text()
    const { tools } = mocks.streamText.mock.calls[0]![0]
    expect(tools.grades).toBeUndefined()
    expect(
      await tools.weather.execute(
        { city: 'Urbana' },
        { abortSignal: undefined },
      ),
    ).toEqual({ text: 'Sunny' })
    expect(mocks.executeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'CS124',
        tool: expect.objectContaining({
          id: 'w1',
          aiGeneratedArgumentValues: { city: 'Urbana' },
        }),
      }),
    )
  })
  it('sends reasoning effort only to reasoning models and temperature only to others', async () => {
    mocks.getModels.mockResolvedValue({
      OpenAI: {
        provider: 'OpenAI',
        enabled: true,
        models: [{ id: 'gpt-4o', enabled: true }],
      },
    })
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-4o',
        effort: 'high',
        temperature: 0.3,
      }),
    )
    await response.text()
    const options = mocks.streamText.mock.calls[0]![0]
    expect(options.reasoning).toBeUndefined()
    expect(options.providerOptions.openai.reasoningSummary).toBeUndefined()
    expect(options.temperature).toBe(0.3)
  })
  it('passes the selected reasoning effort to reasoning models without a temperature', async () => {
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        effort: 'high',
        temperature: 0.3,
      }),
    )
    await response.text()
    const options = mocks.streamText.mock.calls[0]![0]
    expect(options.reasoning).toBe('high')
    expect(options.temperature).toBeUndefined()
  })
  it('continues after a cancelled document search without a missing tool result', async () => {
    const response = await POST(
      request({
        messages: [
          ...messages,
          {
            id: 'interrupted',
            role: 'assistant',
            parts: [
              {
                type: 'tool-searchDocuments',
                toolCallId: 'cancelled-search',
                state: 'input-available',
                input: { query: 'recursion' },
              },
            ],
          },
          {
            id: 'next',
            role: 'user',
            parts: [{ type: 'text', text: 'Try a simpler explanation' }],
          },
        ],
        course_name: 'CS124',
        modelId: 'gpt-5.4',
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('text-delta')
  })

  it('keeps document-only projects connected to retrieval', async () => {
    mocks.metadata.mockResolvedValue({
      system_prompt: 'Project instructions',
      documentsOnly: true,
    })
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        knowledge: false,
      }),
    )
    await response.text()
    expect(
      mocks.streamText.mock.calls[0]![0].tools.searchDocuments,
    ).toBeDefined()
  })
  it('budgets passages against the full history and drops the oldest turns', async () => {
    mocks.getModels.mockResolvedValue({
      OpenAI: {
        provider: 'OpenAI',
        enabled: true,
        models: [{ id: 'gpt-5.4', enabled: true, tokenLimit: 3500 }],
      },
    })
    mocks.fetchContexts.mockResolvedValue(
      Array.from({ length: 40 }, (_, index) => ({
        readable_filename: `Doc ${index}.pdf`,
        text: 'word '.repeat(80),
      })),
    )
    const priorSearch = {
      type: 'tool-searchDocuments',
      toolCallId: 'old',
      state: 'output-available',
      input: { query: 'earlier' },
      output: {
        sources: Array.from({ length: 12 }, (_, index) => ({
          n: index + 1,
          title: `Old ${index}.pdf`,
          text: 'prior '.repeat(150),
        })),
      },
    }
    const history = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'earlier' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [priorSearch, { type: 'text', text: 'ok' }],
      },
      ...messages,
    ]
    const response = await POST(
      request({ messages: history, course_name: 'CS124', modelId: 'gpt-5.4' }),
    )
    await response.text()
    const options = mocks.streamText.mock.calls[0]![0]
    const sent =
      countTokens(options.instructions) + messagesTokens(options.messages)
    expect(sent).toBeLessThanOrEqual(3500)
    expect(JSON.stringify(options.messages)).not.toContain('Old 0.pdf')
    expect(options.messages[0]).toMatchObject({ role: 'user' })
  })
  it('searches conversation uploads and applies link-level behavior flags', async () => {
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        knowledge: false,
        conversationId: 'conv-1',
        linkParameters: { guidedLearning: true, documentsOnly: true },
      }),
    )
    await response.text()
    const options = mocks.streamText.mock.calls[0]![0]
    expect(mocks.fetchContexts).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1' }),
    )
    expect(options.instructions).toContain(GUIDED_LEARNING_PROMPT.trim())
    expect(options.instructions).toContain(DOCUMENT_FOCUS_PROMPT.trim())
  })
  it('drops retrieval when a link enables system-prompt-only mode', async () => {
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        linkParameters: { systemPromptOnly: true },
      }),
    )
    await response.text()
    expect(mocks.fetchContexts).not.toHaveBeenCalled()
    expect(
      mocks.streamText.mock.calls[0]![0].tools.searchDocuments,
    ).toBeUndefined()
  })
  it('never asks for citation tags when citations are disabled', async () => {
    mocks.metadata.mockResolvedValue({
      system_prompt: 'Project instructions',
      disableCitations: true,
    })
    const response = await POST(
      request({ messages, course_name: 'CS124', modelId: 'gpt-5.4' }),
    )
    await response.text()
    const options = mocks.streamText.mock.calls[0]![0]
    expect(options.instructions).not.toContain('<cite>')
    expect(options.tools.searchDocuments.description).not.toContain('<cite>')
  })
  it('sends legacy upload passages with their message', async () => {
    const response = await POST(
      request({
        messages: [
          {
            id: 'u',
            role: 'user',
            parts: [{ type: 'text', text: 'summarize' }],
            metadata: {
              uploads: {
                files: [{ name: 'notes.pdf' }],
                contexts: [
                  { title: 'notes.pdf', text: 'Upload passage', page: '2' },
                ],
              },
            },
          },
          ...messages,
        ],
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        knowledge: false,
      }),
    )
    await response.text()
    expect(
      JSON.stringify(mocks.streamText.mock.calls[0]![0].messages[0]),
    ).toContain('--- notes.pdf, p. 2 ---\\nUpload passage')
  })
  it('stops sending earlier retrieved passages when documents are off', async () => {
    const response = await POST(
      request({
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', text: 'earlier' }],
          },
          {
            id: 'a1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-searchDocuments',
                toolCallId: 'old',
                state: 'output-available',
                input: { query: 'earlier' },
                output: { sources: [{ n: 1, title: 'Old.pdf', text: 'old' }] },
              },
              { type: 'text', text: 'ok' },
            ],
          },
          ...messages,
        ],
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        knowledge: false,
      }),
    )
    await response.text()
    expect(
      JSON.stringify(mocks.streamText.mock.calls[0]![0].messages),
    ).not.toContain('Old.pdf')
  })
  it('does not expose retrieval in system-prompt-only projects', async () => {
    mocks.metadata.mockResolvedValue({ systemPromptOnly: true })
    const response = await POST(
      request({
        messages,
        course_name: 'CS124',
        modelId: 'gpt-5.4',
        knowledge: true,
      }),
    )
    await response.text()
    expect(
      mocks.streamText.mock.calls[0]![0].tools.searchDocuments,
    ).toBeUndefined()
  })
})
