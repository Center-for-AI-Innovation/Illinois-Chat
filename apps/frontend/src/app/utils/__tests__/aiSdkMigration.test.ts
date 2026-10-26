// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runOllamaChat } from '../ollama'
import { runOpenAICompatibleChat } from '../openaiCompatible'
import { runBedrockChat } from '../bedrock'
import { type Conversation } from '~/types/chat'
import {
  type OllamaProvider,
  type OpenAICompatibleProvider,
  type BedrockProvider,
} from '~/utils/modelProviders/LLMProvider'
import { OllamaModelIDs } from '~/utils/modelProviders/ollama'

vi.mock('~/utils/crypto', () => ({
  decryptKeyIfNeeded: vi.fn(async (value: string) => value),
}))

const conversation = {
  model: { id: OllamaModelIDs.GPT_OSS_20B, tokenLimit: 8192 },
  temperature: 0.2,
  messages: [
    {
      role: 'user',
      content: 'hello',
      latestSystemMessage: 'Be helpful',
      finalPromtEngineeredMessage: 'engineered',
    },
  ],
} as Conversation

function completion(reasoning = 'Let me think') {
  return Response.json({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1,
    model: 'test',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: 'answer',
          reasoning_content: reasoning,
        },
      },
    ],
    usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
  })
}

function completionStream() {
  const chunks = [
    {
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', reasoning_content: 'Thinking' },
          finish_reason: null,
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: { reasoning_content: ' more' },
          finish_reason: null,
        },
      ],
    },
    {
      choices: [
        { index: 0, delta: { content: 'answer' }, finish_reason: null },
      ],
    },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ]
  const data =
    chunks
      .map(
        (chunk) =>
          `data: ${JSON.stringify({ id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1, model: 'test', ...chunk })}\n\n`,
      )
      .join('') + 'data: [DONE]\n\n'
  return new Response(data, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('AI SDK 7 provider transport regression', () => {
  it.each([
    'http://localhost:11434',
    'http://localhost:11434/',
    'http://localhost:11434/api',
    'http://localhost:11434/v1/',
  ])('uses Ollama Chat Completions for %s', async (baseUrl) => {
    const fetchMock = vi.fn(async () => completion())
    vi.stubGlobal('fetch', fetchMock)
    const response = await runOllamaChat(
      conversation,
      { baseUrl } as OllamaProvider,
      false,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      choices: [
        { message: { content: '<think>Let me think</think>\nanswer' } },
      ],
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: conversation.model.id,
      max_tokens: 4096,
      reasoning_effort: 'medium',
      messages: [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'engineered' },
      ],
    })
    expect(JSON.parse(init.body as string)).not.toHaveProperty(
      'allowSystemInMessages',
    )
  })

  it('streams Ollama reasoning and text through the real SDK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => completionStream()),
    )
    const response = await runOllamaChat(
      conversation,
      { baseUrl: 'http://localhost:11434' } as OllamaProvider,
      true,
    )
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    )
    expect(await response.text()).toBe('<think>Thinking more</think>\nanswer')
  })

  it('streams plain text without thinking tags for a non-reasoning Ollama response', async () => {
    const data =
      'data: {"id":"1","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(data, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      ),
    )
    const response = await runOllamaChat(
      conversation,
      { baseUrl: 'http://localhost:11434' } as OllamaProvider,
      true,
    )
    expect(await response.text()).toBe('hello')
  })

  it('sends SDK image parts as OpenAI image_url content when streaming', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          'data: {"id":"1","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const imageConversation = {
      ...conversation,
      model: { ...conversation.model, id: 'vision-model' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aGVsbG8=' },
            },
          ],
        },
      ],
    } as Conversation
    const response = await runOpenAICompatibleChat(
      imageConversation,
      {
        apiKey: 'test',
        baseUrl: 'https://example.com/v1',
      } as OpenAICompatibleProvider,
      true,
    )
    expect(await response.text()).toBe('hello')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aGVsbG8=' },
            },
          ],
        },
      ],
    })
  })

  it('authenticates Bedrock with the migrated credential settings', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        output: {
          message: { role: 'assistant', content: [{ text: 'answer' }] },
        },
        stopReason: 'end_turn',
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
        metrics: { latencyMs: 1 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const response = await runBedrockChat(
      {
        ...conversation,
        model: { ...conversation.model, id: 'amazon.nova-lite-v1:0' },
      },
      {
        accessKeyId: 'test-access',
        secretAccessKey: 'test-secret',
        region: 'us-east-1',
      } as BedrockProvider,
      false,
    )
    expect(await response.json()).toEqual({
      choices: [{ message: { content: 'answer' } }],
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toContain('bedrock-runtime.us-east-1.amazonaws.com')
    expect(new Headers(init.headers).get('authorization')).toContain(
      'Credential=test-access/',
    )
    expect(JSON.parse(init.body as string)).toMatchObject({
      inferenceConfig: { maxTokens: 4096 },
      system: [{ text: 'Be helpful' }],
    })
  })
})
