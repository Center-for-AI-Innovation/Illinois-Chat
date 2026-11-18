import { describe, expect, it } from 'vitest'
import { isClosedStreamError } from '../streamErrors'

describe('isClosedStreamError', () => {
  it('is true for a controller that is already closed and for an abort', () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close()
        try {
          controller.enqueue('late')
        } catch (error) {
          expect(isClosedStreamError(error)).toBe(true)
        }
      },
    })
    expect(stream).toBeInstanceOf(ReadableStream)
    expect(isClosedStreamError(new DOMException('aborted', 'AbortError'))).toBe(
      true,
    )
    expect(
      isClosedStreamError(
        Object.assign(new TypeError('x'), { code: 'ERR_INVALID_STATE' }),
      ),
    ).toBe(true)
  })

  it('is false for a real failure and for values that are not errors', () => {
    expect(isClosedStreamError(new Error('ECONNRESET'))).toBe(false)
    expect(isClosedStreamError(new SyntaxError('bad chunk'))).toBe(false)
    expect(isClosedStreamError(null)).toBe(false)
    expect(isClosedStreamError('AbortError')).toBe(false)
    expect(isClosedStreamError(undefined)).toBe(false)
  })
})
