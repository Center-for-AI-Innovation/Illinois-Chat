import { describe, expect, it } from 'vitest'
import {
  DISPLAY_NAME_MAX_LENGTH,
  getChatbotDisplayName,
  getDisplayNameError,
  normalizeDisplayName,
} from '~/utils/chatbotDisplayName'

describe('normalizeDisplayName', () => {
  it('trims and collapses whitespace, keeping case and punctuation', () => {
    expect(normalizeDisplayName('  CS 101:   Intro\tto  CS ')).toBe(
      'CS 101: Intro to CS',
    )
  })

  it('replaces control characters', () => {
    expect(normalizeDisplayName('Bio\u0000\nLab')).toBe('Bio Lab')
  })

  it('returns null for empty, whitespace-only and non-string values', () => {
    expect(normalizeDisplayName('')).toBeNull()
    expect(normalizeDisplayName('   ')).toBeNull()
    expect(normalizeDisplayName(null)).toBeNull()
    expect(normalizeDisplayName(42)).toBeNull()
  })
})

describe('getDisplayNameError', () => {
  it('accepts names up to the limit after normalization', () => {
    expect(getDisplayNameError('a'.repeat(DISPLAY_NAME_MAX_LENGTH))).toBeNull()
    // Surrounding whitespace does not count toward the limit.
    expect(
      getDisplayNameError(`  ${'a'.repeat(DISPLAY_NAME_MAX_LENGTH)}  `),
    ).toBeNull()
    expect(getDisplayNameError('')).toBeNull()
  })

  it('rejects names over the limit', () => {
    expect(
      getDisplayNameError('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)),
    ).toMatch(/characters or fewer/)
  })
})

describe('getChatbotDisplayName', () => {
  it('prefers the display name', () => {
    expect(
      getChatbotDisplayName('cs101-fa24', { display_name: 'Intro to CS' }),
    ).toBe('Intro to CS')
  })

  it('falls back to the project name when unset or blank', () => {
    expect(getChatbotDisplayName('cs101-fa24', {})).toBe('cs101-fa24')
    expect(getChatbotDisplayName('cs101-fa24', { display_name: '  ' })).toBe(
      'cs101-fa24',
    )
    expect(getChatbotDisplayName('cs101-fa24', null)).toBe('cs101-fa24')
  })
})
