import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DISABLED_TOOLS_KEY,
  readDisabledToolIds,
  removeDisabledTools,
  setToolDisabled,
} from '../disabledTools'

const stored = () => JSON.parse(localStorage.getItem(DISABLED_TOOLS_KEY)!)

describe('disabledTools', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('reads nothing disabled when the store is empty or the id is missing', () => {
    expect(readDisabledToolIds('conv-1')).toEqual([])
    expect(readDisabledToolIds(undefined)).toEqual([])
  })

  it('treats a malformed store as nothing disabled', () => {
    localStorage.setItem(DISABLED_TOOLS_KEY, '{not json')
    expect(readDisabledToolIds('conv-1')).toEqual([])

    localStorage.setItem(DISABLED_TOOLS_KEY, JSON.stringify(['wf-1']))
    expect(readDisabledToolIds('conv-1')).toEqual([])
  })

  it('keeps well-formed entries when another entry is malformed', () => {
    localStorage.setItem(
      DISABLED_TOOLS_KEY,
      JSON.stringify({ 'conv-1': ['wf-1', 7], 'conv-2': 'wf-2' }),
    )
    expect(readDisabledToolIds('conv-1')).toEqual(['wf-1'])
    expect(readDisabledToolIds('conv-2')).toEqual([])
  })

  it('adds and removes one tool at a time, per conversation', () => {
    setToolDisabled('conv-1', 'wf-1', true)
    setToolDisabled('conv-1', 'wf-2', true)
    setToolDisabled('conv-2', 'wf-1', true)
    expect(stored()).toEqual({
      'conv-1': ['wf-1', 'wf-2'],
      'conv-2': ['wf-1'],
    })

    setToolDisabled('conv-1', 'wf-1', false)
    expect(readDisabledToolIds('conv-1')).toEqual(['wf-2'])
    expect(readDisabledToolIds('conv-2')).toEqual(['wf-1'])
  })

  it('drops a conversation, and then the key, once nothing is disabled', () => {
    setToolDisabled('conv-1', 'wf-1', true)
    setToolDisabled('conv-2', 'wf-1', true)

    setToolDisabled('conv-1', 'wf-1', false)
    expect(stored()).toEqual({ 'conv-2': ['wf-1'] })

    setToolDisabled('conv-2', 'wf-1', false)
    expect(localStorage.getItem(DISABLED_TOOLS_KEY)).toBeNull()
  })

  it('does not duplicate an id disabled twice', () => {
    setToolDisabled('conv-1', 'wf-1', true)
    setToolDisabled('conv-1', 'wf-1', true)
    expect(readDisabledToolIds('conv-1')).toEqual(['wf-1'])
  })

  it('does not throw when storage rejects the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    expect(() => setToolDisabled('conv-1', 'wf-1', true)).not.toThrow()
    expect(readDisabledToolIds('conv-1')).toEqual([])
  })

  it('removes one conversation', () => {
    setToolDisabled('conv-1', 'wf-1', true)
    setToolDisabled('conv-2', 'wf-2', true)

    removeDisabledTools('conv-1')
    expect(stored()).toEqual({ 'conv-2': ['wf-2'] })
    removeDisabledTools('conv-unknown')
    expect(stored()).toEqual({ 'conv-2': ['wf-2'] })
  })
})
