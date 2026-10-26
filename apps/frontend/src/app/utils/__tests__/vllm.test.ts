/* @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildVLLMResponseContent, runVLLM } from '../vllm'
import { type Conversation } from '~/types/chat'

const conversation = {
  model: { id: 'Qwen/Qwen3.5-27B' },
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

function sse(deltas: Record<string, string>[]) {
  const chunks = [
    ...deltas.map((delta) => ({
      choices: [{ index: 0, delta, finish_reason: null }],
    })),
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ]
  const data =
    chunks
      .map((chunk) => `data: ${JSON.stringify({ id: '1', ...chunk })}\n\n`)
      .join('') + 'data: [DONE]\n\n'
  // Split events across transport chunks so parsing is exercised by the SDK.
  return new Response(
    new ReadableStream({
      start(controller) {
        const bytes = new TextEncoder().encode(data)
        controller.enqueue(bytes.slice(0, 31))
        controller.enqueue(bytes.slice(31))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

beforeEach(() => {
  vi.stubEnv('NCSA_HOSTED_VLM_BASE_URL', 'https://vllm.example/v1')
  vi.stubEnv('NCSA_HOSTED_API_KEY', 'test-key')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('vLLM through AI SDK', () => {
  it('combines reasoning and content into the UI think-tag format', () => {
    expect(
      buildVLLMResponseContent({
        content: '\n\nHello!',
        reasoning: 'Thinking Process:\n\n1. Analyze',
      }),
    ).toBe('<think>Thinking Process:\n\n1. Analyze</think>\n\nHello!')
  })

  it.each(['reasoning', 'reasoning_content'])(
    'generates text with %s and preserves request parameters',
    async (field) => {
      const fetchMock = vi.fn(async () =>
        completion({ content: '\n\nHello!', [field]: 'Thinking' }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const response = await runVLLM(conversation, false)
      expect(await response.json()).toEqual({
        choices: [
          { message: { content: '<think>Thinking</think>\n\nHello!' } },
        ],
      })
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ]
      expect(url).toBe('https://vllm.example/v1/chat/completions')
      expect(new Headers(init.headers).get('authorization')).toBe(
        'Bearer test-key',
      )
      expect(JSON.parse(init.body as string)).toMatchObject({
        model: conversation.model.id,
        max_tokens: 8192,
        temperature: 0.2,
        top_p: 0.8,
        repetition_penalty: 1.05,
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'engineered' },
        ],
      })
    },
  )

  it('leaves direct-answer streaming content unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sse([{ content: '4' }])),
    )
    const response = await runVLLM(conversation, true)
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    )
    await expect(response.text()).resolves.toBe('4')
  })

  it('streams reasoning followed by content across partial SSE chunks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          { reasoning: 'Thinking' },
          { reasoning: ' Process' },
          { content: '\n\nHello!' },
        ]),
      ),
    )
    const response = await runVLLM(conversation, true)
    await expect(response.text()).resolves.toBe(
      '<think>Thinking Process</think>\n\nHello!',
    )
  })

  it('returns the existing error envelope for authentication failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { message: 'Invalid API key' } },
          { status: 401 },
        ),
      ),
    )
    const response = await runVLLM(conversation, false)
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      source: 'VLLM',
      error: 'Invalid API key',
    })
  })
})
