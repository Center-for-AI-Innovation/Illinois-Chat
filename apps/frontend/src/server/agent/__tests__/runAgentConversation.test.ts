import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  fetchToolsServer: vi.fn(),
  selectToolsServer: vi.fn(),
}))

vi.mock('../agentServerUtils', () => ({
  selectToolsServer: hoisted.selectToolsServer,
  fetchToolsServer: hoisted.fetchToolsServer,
  executeToolsServer: vi.fn(),
  fetchContextsServer: vi.fn(),
  getOpenAIToolFromUIUCTool: vi.fn(),
  generatePresignedUrlServer: vi.fn(),
}))
vi.mock('~/pages/api/conversation', () => ({
  persistMessageServer: vi.fn(async () => undefined),
}))
vi.mock('~/app/utils/buildPromptUtils', () => ({ buildPrompt: vi.fn() }))
vi.mock('~/utils/streamProcessing', () => ({
  routeModelRequest: vi.fn(),
  processChunkWithStateMachine: vi.fn(),
  State: {},
}))

import { runAgentConversation } from '../runAgentConversation'

const makeTool = (name: string) => ({
  id: name,
  name,
  readableName: name,
  description: '',
  enabled: true,
})

const run = (disabledTools?: string[]) =>
  runAgentConversation({
    conversation: {
      id: 'conv-1',
      name: 'Test',
      messages: [],
      model: { id: 'gpt-4o', name: 'GPT-4o' },
      prompt: '',
      temperature: 0.7,
      folderId: null,
    } as any,
    courseName: 'CS101',
    userMessage: { id: 'msg-1', role: 'user', content: 'hi' } as any,
    documentGroups: [],
    disabledTools,
    courseMetadata: {} as any,
    llmProviders: {} as any,
    openaiKey: '',
    toolRouter: { source: 'custom' } as any,
    userIdentifier: 'u@example.com',
    assistantMessageId: 'asst-1',
    emit: vi.fn(),
  })

describe('runAgentConversation disabledTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    hoisted.fetchToolsServer.mockResolvedValue([
      makeTool('tool_a'),
      makeTool('tool_b'),
    ])
    // Abort the loop right after capturing what the router was offered.
    hoisted.selectToolsServer.mockRejectedValue(new Error('stop'))
  })

  const offeredToolNames = () =>
    (hoisted.selectToolsServer.mock.calls[0]![0].availableTools as any[]).map(
      (t) => t.name,
    )

  it('omits disabled tools from what the router is offered', async () => {
    await run(['tool_a'])

    expect(offeredToolNames()).toEqual(['search_documents', 'tool_b'])
  })

  it('offers every tool when none are disabled', async () => {
    await run()

    expect(offeredToolNames()).toEqual(['search_documents', 'tool_a', 'tool_b'])
  })

  it('keeps the retrieval tool even if every Sim tool is disabled', async () => {
    await run(['tool_a', 'tool_b'])

    expect(offeredToolNames()).toEqual(['search_documents'])
  })
})
