/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { buildVLLMResponseContent, normalizeVLLMStreamResponse } from '../vllm'

describe('vllm reasoning normalization', () => {
  it('combines reasoning and content into the UI think-tag format', () => {
    expect(
      buildVLLMResponseContent({
        content: '\n\nHello!',
        reasoning: 'Thinking Process:\n\n1. Analyze',
      }),
    ).toBe('<think>Thinking Process:\n\n1. Analyze</think>\n\nHello!')
  })

  it('leaves direct-answer streaming content unchanged', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"4"},"finish_reason":null}]}\n\n',
          ),
        )
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    // [DONE] closes the reply and then the provider stream ends: that must
    // not be a second close, which would be an ERROR line for every reply.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = normalizeVLLMStreamResponse(new Response(stream))

    await expect(response.text()).resolves.toBe('4')
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('writes one ERROR line when the provider stream breaks, and none when the reader went away', async () => {
    const encode = (text: string) => new TextEncoder().encode(text)
    const chunk =
      'data: {"choices":[{"delta":{"content":"4"},"finish_reason":null}]}\n\n'
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    let sent = false
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true
          controller.enqueue(encode(chunk))
        } else {
          controller.error(new TypeError('terminated'))
        }
      },
    })
    await expect(
      normalizeVLLMStreamResponse(new Response(broken)).text(),
    ).rejects.toThrow('terminated')
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]![0])).toMatch(
      / ERROR   llm\.vllm LLM stream failed at=\S+\nTypeError: terminated/,
    )

    error.mockClear()
    const many = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 20; i++) controller.enqueue(encode(chunk))
        controller.enqueue(encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    const reader = normalizeVLLMStreamResponse(
      new Response(many),
    ).body!.getReader()
    await reader.read()
    await reader.cancel()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('streams reasoning deltas as an opening think block followed by content', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"reasoning":"Thinking"},"finish_reason":null}]}\n\n',
          ),
        )
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"reasoning":" Process"},"finish_reason":null}]}\n\n',
          ),
        )
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"\\n\\nHello!"},"finish_reason":null}]}\n\n',
          ),
        )
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    const response = normalizeVLLMStreamResponse(new Response(stream))

    await expect(response.text()).resolves.toBe(
      '<think>Thinking Process</think>\n\nHello!',
    )
  })
})
