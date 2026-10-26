// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runOpenAICompatibleChat } from '../openaiCompatible'
import { type Conversation } from '~/types/chat'
import { type OpenAICompatibleProvider } from '~/utils/modelProviders/LLMProvider'

vi.mock('~/utils/crypto', () => ({
  decryptKeyIfNeeded: vi.fn(async (value: string) => value),
}))

const conversation = {
  model: { id: 'openai/gpt-oss-20b' },
  temperature: 0.2,
  messages: [
    {
      role: 'user',
      content: 'hello',
      latestSystemMessage: 'system',
      finalPromtEngineeredMessage: 'engineered',
    },
  ],
} as Conversation
const provider = {
  apiKey: 'test-key',
  baseUrl: 'https://example.com/v1',
} as OpenAICompatibleProvider

function completion(message: Record<string, unknown>) {
  return Response.json({
    id: '1',
    created: 1,
    model: 'test',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', ...message },
      },
    ],
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('OpenAI-compatible generation through AI SDK', () => {
  it.each([
    { content: 'answer', reasoning: 'thinking' },
    { content: 'answer', reasoning_content: 'thinking' },
    {
      content: 'answer',
      reasoning_details: [{ type: 'reasoning.text', text: 'thinking' }],
    },
    {
      content: [
        { type: 'thinking', thinking: [{ type: 'text', text: 'thinking' }] },
        { type: 'text', text: 'answer' },
      ],
    },
  ])('preserves provider-specific reasoning: %j', async (message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => completion(message)),
    )
    const response = await runOpenAICompatibleChat(
      conversation,
      provider,
      false,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      choices: [{ message: { content: '<think>thinking</think>\nanswer' } }],
    })
  })

  it('does not duplicate native think tags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        completion({
          content: '<think>thinking</think>\nanswer',
          reasoning: 'thinking',
        }),
      ),
    )
    const response = await runOpenAICompatibleChat(
      conversation,
      provider,
      false,
    )
    expect(await response.json()).toEqual({
      choices: [{ message: { content: '<think>thinking</think>\nanswer' } }],
    })
  })

  it.each([
    ['https://api.groq.com/openai/v1', { reasoning_effort: 'medium' }],
    ['https://openrouter.ai/api/v1', { reasoning: { effort: 'medium' } }],
  ])(
    'sends reasoning settings through SDK provider options to %s',
    async (baseUrl, options) => {
      const fetchMock = vi.fn(async () =>
        completion({ content: 'answer', reasoning: 'thinking' }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const response = await runOpenAICompatibleChat(
        {
          ...conversation,
          model: { ...conversation.model, id: 'OpenAI/GPT-OSS-20B' },
        },
        { ...provider, baseUrl },
        false,
      )
      expect(response.status).toBe(200)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ]
      expect(url).toBe(`${baseUrl}/chat/completions`)
      expect(new Headers(init.headers).get('authorization')).toBe(
        'Bearer test-key',
      )
      expect(JSON.parse(init.body as string)).toMatchObject({
        ...options,
        max_tokens: 16384,
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'engineered' },
        ],
      })
      expect(JSON.parse(init.body as string).model).toBe(
        baseUrl.includes('openrouter')
          ? 'openai/gpt-oss-20b'
          : 'OpenAI/GPT-OSS-20B',
      )
    },
  )

  it.each([
    ['https://api.groq.com/openai/v1', { reasoning_effort: 'medium' }],
    ['https://openrouter.ai/api/v1', { reasoning: { effort: 'medium' } }],
  ])(
    'streams reasoning through SDK provider options to %s',
    async (baseUrl, options) => {
      const chunks = [
        { delta: { reasoning: 'thinking' }, finish_reason: null },
        { delta: { content: 'answer' }, finish_reason: null },
        { delta: {}, finish_reason: 'stop' },
      ]
      const data =
        chunks
          .map(
            (chunk) =>
              `data: ${JSON.stringify({ id: '1', choices: [{ index: 0, ...chunk }] })}\n\n`,
          )
          .join('') + 'data: [DONE]\n\n'
      const fetchMock = vi.fn(
        async () =>
          new Response(data, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const response = await runOpenAICompatibleChat(
        conversation,
        { ...provider, baseUrl },
        true,
      )
      expect(await response.text()).toBe('<think>thinking</think>\nanswer')
      const [, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ]
      expect(JSON.parse(init.body as string)).toMatchObject(options)
    },
  )

  it('generates direct answers for non-reasoning models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => completion({ content: 'answer' })),
    )
    const response = await runOpenAICompatibleChat(
      { ...conversation, model: { ...conversation.model, id: 'plain-model' } },
      provider,
      false,
    )
    expect(await response.json()).toEqual({
      choices: [{ message: { content: 'answer' } }],
    })
  })

  it('keeps the error response envelope on API failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { message: 'Invalid API key' } },
          { status: 401 },
        ),
      ),
    )
    const response = await runOpenAICompatibleChat(
      conversation,
      provider,
      false,
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      source: 'OpenAICompatible',
      error: 'Invalid API key',
    })
  })
})
