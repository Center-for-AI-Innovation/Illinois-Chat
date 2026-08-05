import { describe, expect, it } from 'vitest'

import {
  buildProjectChatPath,
  getProjectNameError,
  isValidProjectName,
  PROJECT_NAME_MAX_LENGTH,
} from '../projectName'

describe('isValidProjectName', () => {
  it('accepts URL-safe names', () => {
    expect(isValidProjectName('my-bot_2')).toBe(true)
    expect(isValidProjectName('CropWizard')).toBe(true)
    expect(isValidProjectName('a')).toBe(true)
    expect(isValidProjectName('a'.repeat(PROJECT_NAME_MAX_LENGTH))).toBe(true)
  })

  it('rejects names with characters outside [a-zA-Z0-9_-]', () => {
    expect(isValidProjectName('cropwizard-1.5')).toBe(false)
    expect(isValidProjectName('héllo')).toBe(false)
    expect(isValidProjectName('has space')).toBe(false)
    expect(isValidProjectName('emoji🐛')).toBe(false)
    expect(isValidProjectName('a/b')).toBe(false)
    expect(isValidProjectName('name\n')).toBe(false)
  })

  it('rejects empty and over-length names', () => {
    expect(isValidProjectName('')).toBe(false)
    expect(isValidProjectName('a'.repeat(PROJECT_NAME_MAX_LENGTH + 1))).toBe(
      false,
    )
  })
})

describe('getProjectNameError', () => {
  it('returns null for valid or empty names', () => {
    expect(getProjectNameError('my-bot')).toBeNull()
    expect(getProjectNameError('')).toBeNull()
  })

  it('describes invalid characters', () => {
    expect(getProjectNameError('cropwizard-1.5')).toMatch(
      /letters, numbers, dashes, and underscores/,
    )
  })

  it('describes over-length names', () => {
    expect(
      getProjectNameError('a'.repeat(PROJECT_NAME_MAX_LENGTH + 1)),
    ).toMatch(new RegExp(`${PROJECT_NAME_MAX_LENGTH} characters or fewer`))
  })
})

describe('buildProjectChatPath', () => {
  it('builds the chat path for a valid name', () => {
    expect(buildProjectChatPath('my-bot')).toBe('/my-bot/chat')
  })

  it('encodes rather than mangles legacy special-char names', () => {
    expect(buildProjectChatPath('cropwizard-1.5')).toBe(
      '/cropwizard-1.5/chat',
    )
    expect(buildProjectChatPath('has space')).toBe('/has%20space/chat')
  })

  it('guards against path traversal and protocol-relative tricks', () => {
    expect(buildProjectChatPath('../evil')).toBe('/evil/chat')
    expect(buildProjectChatPath('//evil.com')).toBe('/evil.com/chat')
    expect(buildProjectChatPath('a/b')).toBe('/a%2Fb/chat')
  })

  it('falls back to /chat for empty input', () => {
    expect(buildProjectChatPath('')).toBe('/chat')
    expect(buildProjectChatPath('   ')).toBe('/chat')
    expect(buildProjectChatPath('...')).toBe('/chat')
  })
})
