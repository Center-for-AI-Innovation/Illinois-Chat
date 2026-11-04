// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'
import { resolveWorkspaceModel } from '../workspaceModel'
import { type AllLLMProviders } from '~/utils/modelProviders/LLMProvider'
vi.mock('~/utils/crypto', () => ({
  decryptKeyIfNeeded: vi.fn(async (value: string) => value),
}))
afterEach(() => vi.unstubAllGlobals())

const providers = {
  OpenAI: {
    provider: 'OpenAI',
    enabled: true,
    apiKey: 'test-key',
    models: [{ id: 'gpt-5.4', enabled: true }],
  },
} as unknown as AllLLMProviders

describe('workspace provider selection', () => {
  it('uses OpenAI Responses and requests reasoning summaries', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: 'resp-1',
        created_at: 1,
        model: 'gpt-5.4',
        object: 'response',
        status: 'completed',
        output: [
          {
            id: 'reason-1',
            type: 'reasoning',
            summary: [{ type: 'summary_text', text: 'Thinking' }],
          },
          {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Answer', annotations: [] }],
          },
        ],
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const model = await resolveWorkspaceModel(providers, 'gpt-5.4')
    const result = await generateText({
      model,
      prompt: 'hello',
      providerOptions: {
        openai: {
          reasoningEffort: 'medium',
          reasoningSummary: 'auto',
          store: false,
        },
      },
    })
    expect(result.text).toBe('Answer')
    expect(result.finalStep.reasoningText).toBe('Thinking')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(JSON.parse(init.body as string)).toMatchObject({
      store: false,
      reasoning: { effort: 'medium', summary: 'auto' },
    })
  })
  it('rejects models not enabled for the project', async () => {
    await expect(
      resolveWorkspaceModel(providers, 'not-allowed'),
    ).rejects.toThrow('not enabled')
  })
  it('uses the native Anthropic messages model', async () => {
    const model = await resolveWorkspaceModel(
      {
        Anthropic: {
          provider: 'Anthropic',
          enabled: true,
          apiKey: 'key',
          models: [{ id: 'claude-sonnet-4-6-thinking', enabled: true }],
        },
      } as unknown as AllLLMProviders,
      'claude-sonnet-4-6-thinking',
    )
    expect(typeof model !== 'string' && model.modelId).toBe('claude-sonnet-4-6')
    expect(typeof model !== 'string' && model.provider).toContain('anthropic')
  })
})
