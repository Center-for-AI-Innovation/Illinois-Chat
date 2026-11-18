/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({ streamText: vi.fn() }))

vi.mock('ai', () => ({
  streamText: hoisted.streamText,
  generateText: vi.fn(),
  smoothStream: vi.fn(() => undefined),
}))
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: () => () => ({ modelId: 'test-model' }),
}))
vi.mock('~/utils/crypto', () => ({
  decryptKeyIfNeeded: async (key: string) => key,
}))

import { runOpenAICompatibleChat } from '../openaiCompatible'

const conversation: any = {
  model: { id: 'test-model' },
  temperature: 0.1,
  messages: [{ id: 'u1', role: 'user', content: 'hi' }],
}
const provider: any = { apiKey: 'k', baseUrl: 'https://llm.example.edu/v1' }

// The parts that streamText gives, then an optional throw from the read.
function fullStreamOf(parts: unknown[], failure?: unknown) {
  hoisted.streamText.mockResolvedValueOnce({
    fullStream: (async function* () {
      for (const part of parts) yield part
      if (failure !== undefined) throw failure
    })(),
  })
}

const errorLines = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map(([line]) => String(line))

afterEach(() => vi.restoreAllMocks())

describe('runOpenAICompatibleChat, a reply that fails after it started', () => {
  it('writes one ERROR line when the provider sends an error part', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    fullStreamOf([
      { type: 'text-delta', textDelta: 'Hel' },
      { type: 'error', error: new Error('429 rate limited') },
    ])
    const response = await runOpenAICompatibleChat(conversation, provider, true)
    expect(response.status).toBe(200)
    await expect(response.text()).rejects.toThrow('429 rate limited')
    expect(errorLines(error)).toHaveLength(1)
    expect(errorLines(error)[0]).toMatch(
      / ERROR   llm\.openaiCompatible LLM stream failed model=test-model at=\S+\nError: 429 rate limited/,
    )
  })

  it('writes one ERROR line when the read of the stream throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    fullStreamOf(
      [{ type: 'text-delta', textDelta: 'Hel' }],
      new TypeError('terminated'),
    )
    const response = await runOpenAICompatibleChat(conversation, provider, true)
    await expect(response.text()).rejects.toThrow('terminated')
    expect(errorLines(error)).toHaveLength(1)
    expect(errorLines(error)[0]).toMatch(
      / LLM stream failed model=test-model at=\S+\nTypeError: terminated/,
    )
  })

  it('writes nothing for a reply that ends well, and passes the text on', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    fullStreamOf([
      { type: 'text-delta', textDelta: 'Hel' },
      { type: 'text-delta', textDelta: 'lo' },
    ])
    const response = await runOpenAICompatibleChat(conversation, provider, true)
    await expect(response.text()).resolves.toBe('Hello')
    expect(error).not.toHaveBeenCalled()
  })

  it('answers 500 with one ERROR line when the first part is an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    fullStreamOf([{ type: 'error', error: new Error('401 bad key') }])
    const response = await runOpenAICompatibleChat(conversation, provider, true)
    expect(response.status).toBe(500)
    expect(errorLines(error)).toHaveLength(1)
    expect(errorLines(error)[0]).not.toContain('LLM stream failed')
  })
})
