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

const makeTool = (id: string, name: string) => ({
  id,
  name,
  readableName: name,
  description: '',
  enabled: true,
})

const run = (disabledToolIds?: string[]) =>
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
    disabledToolIds,
    courseMetadata: {} as any,
    llmProviders: {} as any,
    openaiKey: '',
    toolRouter: { source: 'custom' } as any,
    userIdentifier: 'u@example.com',
    assistantMessageId: 'asst-1',
    emit: vi.fn(),
  })

describe('runAgentConversation disabledToolIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    hoisted.fetchToolsServer.mockResolvedValue([
      makeTool('wf-a', 'tool_a'),
      makeTool('wf-b', 'tool_b'),
    ])
    // Abort the loop right after capturing what the router was offered.
    hoisted.selectToolsServer.mockRejectedValue(new Error('stop'))
  })

  const offeredToolNames = () =>
    (hoisted.selectToolsServer.mock.calls[0]![0].availableTools as any[]).map(
      (t) => t.name,
    )

  it('omits disabled tools from what the router is offered', async () => {
    await run(['wf-a'])

    expect(offeredToolNames()).toEqual(['search_documents', 'tool_b'])
  })

  it('offers every tool when none are disabled', async () => {
    await run()

    expect(offeredToolNames()).toEqual(['search_documents', 'tool_a', 'tool_b'])
  })

  it('keeps the retrieval tool even if every Sim tool is disabled', async () => {
    await run(['wf-a', 'wf-b'])

    expect(offeredToolNames()).toEqual(['search_documents'])
  })

  it('omits only the disabled workflow when two share a tool name', async () => {
    hoisted.fetchToolsServer.mockResolvedValue([
      makeTool('wf-1', 'sim_grade_report'),
      makeTool('wf-2', 'sim_grade_report'),
    ])

    await run(['wf-1'])

    const offeredIds = (
      hoisted.selectToolsServer.mock.calls[0]![0].availableTools as any[]
    ).map((t) => t.id)
    expect(offeredIds).not.toContain('wf-1')
    expect(offeredIds).toContain('wf-2')
  })
})
