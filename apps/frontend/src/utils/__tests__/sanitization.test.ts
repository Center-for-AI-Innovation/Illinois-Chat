import { describe, expect, it } from 'vitest'
import { sanitizeForLogging, sanitizeText, truncateText } from '../sanitization'

describe('sanitizeText', () => {
  it('removes null bytes in multiple forms', () => {
    const input = `a\u0000b\\u0000c\0d`
    expect(sanitizeText(input)).toBe('abcd')
  })

  it('replaces lone surrogates with U+FFFD but keeps valid surrogate pairs', () => {
    expect(sanitizeText('a\ud83e...')).toBe('a\uFFFD...')
    expect(sanitizeText('a\udd16b')).toBe('a\uFFFDb')
    expect(sanitizeText('🤖 ok \ud83e')).toBe('🤖 ok \uFFFD')
  })
})

describe('truncateText', () => {
  it('returns short text unchanged', () => {
    expect(truncateText('abc', 5)).toBe('abc')
  })

  it('truncates by code point so emoji at the boundary are not split', () => {
    const text = 'a'.repeat(99) + '🤖 AI and LLMs'
    const out = truncateText(text, 100)
    expect(out).toBe('a'.repeat(99) + '🤖...')
    expect(out.isWellFormed()).toBe(true)
  })

  it('does not truncate when only UTF-16 length exceeds the limit', () => {
    const text = '🤖'.repeat(100)
    expect(truncateText(text, 100)).toBe(text)
  })
})

describe('sanitizeForLogging', () => {
  it('recursively sanitizes string values in objects and arrays', () => {
    const input = {
      ok: 'hi',
      bad: 'a\u0000b',
      nested: [{ value: 'x\\u0000y' }, 123, null],
    }

    const sanitized = sanitizeForLogging(input)
    expect(sanitized).toEqual({
      ok: 'hi',
      bad: 'ab',
      nested: [{ value: 'xy' }, 123, null],
    })
  })

  it('returns non-string primitives unchanged', () => {
    expect(sanitizeForLogging(123)).toBe(123)
    expect(sanitizeForLogging(null)).toBeNull()
    expect(sanitizeForLogging(undefined)).toBeUndefined()
    expect(sanitizeForLogging(true)).toBe(true)
  })
})
