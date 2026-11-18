import { describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => {
  return {
    createOpenAI: vi.fn(() => (modelId: string) => ({ modelId })),
    streamText: vi.fn(async () => ({
      toTextStreamResponse: () => new Response('vlm-stream'),
    })),
    generateText: vi.fn(async () => ({ text: 'vlm-text' })),
    convertConversationToCoreMessagesWithoutSystem: vi.fn(() => []),
  }
})

vi.mock('~/app/api/authorization', () => ({
  withCourseAccessFromRequest: () => (h: any) => h,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: hoisted.createOpenAI,
}))

vi.mock('ai', () => ({
  streamText: hoisted.streamText,
  generateText: hoisted.generateText,
}))

vi.mock('~/utils/apiUtils', () => ({
  convertConversationToCoreMessagesWithoutSystem:
    hoisted.convertConversationToCoreMessagesWithoutSystem,
}))

import { POST } from '../vlm/route'

describe('app/api/chat/vlm POST', () => {
  const conversation = {
    model: { id: 'vlm-model' },
    temperature: 0.2,
    messages: [{ role: 'user', content: 'hi' }],
  }

  it('returns JSON choices when stream=false', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ conversation, stream: false }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.choices?.[0]?.message?.content).toBe('vlm-text')
  })

  it('streams when stream=true', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ conversation, stream: true }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('vlm-stream')

    // streamText does not throw when the provider fails; it calls onError.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { onError } = (hoisted.streamText.mock.calls as any[]).at(-1)[0]
    onError({ error: new Error('model not found') })
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        / ERROR   api\.chat\.vlm .*LLM stream failed model=\S+ at=src\/app\/api\/chat\/vlm\/route\.ts:\d+\nError: model not found/,
      ),
    )
    consoleError.mockRestore()
  })

  it('returns 500 on handler errors', async () => {
    // The handler used to crash on an empty messages array only because of a
    // debug line that read messages[0]; that line is gone, so fail the model call.
    hoisted.generateText.mockRejectedValueOnce(new Error('vlm down'))
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        conversation: {
          model: { id: 'vlm-model' },
          temperature: 0.2,
          messages: [],
        },
        stream: false,
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(500)
  })
})
