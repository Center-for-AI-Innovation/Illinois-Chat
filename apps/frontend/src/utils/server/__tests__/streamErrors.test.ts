/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLogger } from '../log'
import { runWithLogContext } from '../requestContext'
import { isClosedStreamError, logStreamFailure } from '../streamErrors'

afterEach(() => vi.restoreAllMocks())

describe('isClosedStreamError', () => {
  it('is true for a controller that is already closed and for an abort', () => {
    let thrown: unknown
    new ReadableStream({
      start(controller) {
        controller.close()
        try {
          controller.enqueue('late')
        } catch (error) {
          thrown = error
        }
      },
    })
    expect(thrown).toBeInstanceOf(TypeError)
    expect(isClosedStreamError(thrown)).toBe(true)
    expect(isClosedStreamError(new DOMException('aborted', 'AbortError'))).toBe(
      true,
    )
  })

  it('is false for a real failure, another wrong state and values that are not errors', () => {
    expect(isClosedStreamError(new TypeError('terminated'))).toBe(false)
    expect(isClosedStreamError(new SyntaxError('bad chunk'))).toBe(false)
    expect(
      isClosedStreamError(
        Object.assign(
          new TypeError('Invalid state: ReadableStream is locked'),
          {
            code: 'ERR_INVALID_STATE',
          },
        ),
      ),
    ).toBe(false)
    expect(isClosedStreamError(null)).toBe(false)
    expect(isClosedStreamError('AbortError')).toBe(false)
    expect(isClosedStreamError(undefined)).toBe(false)
  })
})

describe('logStreamFailure', () => {
  const log = getLogger('llm.test')
  const encoder = new TextEncoder()

  // A reply body that sends its chunks and then fails or ends.
  function replyOf(chunks: string[], failure?: unknown) {
    let sent = 0
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent < chunks.length) {
          controller.enqueue(encoder.encode(chunks[sent++]))
        } else if (failure !== undefined) {
          controller.error(failure)
        } else {
          controller.close()
        }
      },
      cancel,
    })
    const response = new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Test': '1' },
    })
    return { response, cancel }
  }

  it('passes the reply on unchanged and writes nothing when it ends well', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { response } = replyOf(['Hel', 'lo'])
    const wrapped = logStreamFailure(response, log, { model: 'm1' })
    expect(wrapped.status).toBe(200)
    expect(wrapped.headers.get('X-Test')).toBe('1')
    await expect(wrapped.text()).resolves.toBe('Hello')
    expect(error).not.toHaveBeenCalled()
  })

  it('writes one ERROR line, with the request id, when the read fails after the reply started', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { response } = replyOf(['partial '], new TypeError('terminated'))
    // The wrapper is made inside the request; the reads happen outside it.
    const wrapped = runWithLogContext(
      { rid: 'abc123', path: '/api/chat', course: 'ece120' },
      () => logStreamFailure(response, log, { model: 'm1' }),
    )
    await expect(wrapped.text()).rejects.toThrow('terminated')
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]![0]).toMatch(
      / ERROR   llm\.test rid=abc123 path=\/api\/chat course=ece120 LLM stream failed model=m1 at=src\/utils\/server\/streamErrors\.ts:\d+\nTypeError: terminated/,
    )
  })

  it('writes the line without a request context too', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { response } = replyOf([], new Error('boom'))
    await expect(logStreamFailure(response, log).text()).rejects.toThrow('boom')
    expect(error.mock.calls[0]![0]).toMatch(
      / ERROR   llm\.test LLM stream failed at=\S+\nError: boom/,
    )
  })

  it('writes nothing when the reader went away, and stops reading from the provider', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const aborted = replyOf(['a'], new DOMException('aborted', 'AbortError'))
    await expect(
      logStreamFailure(aborted.response, log).text(),
    ).rejects.toThrow('aborted')
    expect(error).not.toHaveBeenCalled()

    const { response, cancel } = replyOf(['a', 'b', 'c'])
    const reader = logStreamFailure(response, log).body!.getReader()
    await reader.read()
    await reader.cancel('user stopped')
    expect(cancel).toHaveBeenCalledWith('user stopped')
    expect(error).not.toHaveBeenCalled()
  })

  it('gives back a reply that has no body', () => {
    const empty = new Response(null, { status: 204 })
    expect(logStreamFailure(empty, log)).toBe(empty)
  })
})
