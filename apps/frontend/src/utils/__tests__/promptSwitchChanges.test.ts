import { describe, expect, it } from 'vitest'

import { changedSwitchFields } from '../promptSwitchChanges'

const saved = {
  guidedLearning: false,
  documentsOnly: false,
  disableCitations: false,
  systemPromptOnly: false,
  vectorSearchRewrite: true,
  agentModeFeatureEnabled: false,
}

describe('changedSwitchFields', () => {
  it('returns nothing when no switch changed', () => {
    expect(changedSwitchFields({ ...saved }, saved)).toEqual({})
  })

  it('returns only the switches that changed, as metadata fields', () => {
    expect(
      changedSwitchFields(
        { ...saved, documentsOnly: true, vectorSearchRewrite: false },
        saved,
      ),
    ).toEqual({ documentsOnly: true, vector_search_rewrite_disabled: true })
  })

  it('maps agent mode to agent_mode_enabled', () => {
    expect(
      changedSwitchFields({ ...saved, agentModeFeatureEnabled: true }, saved),
    ).toEqual({ agent_mode_enabled: true })
  })

  it('ignores disableCitations when the editor has no such switch', () => {
    const { disableCitations: _omit, ...embedSaved } = saved
    expect(changedSwitchFields({ ...embedSaved }, embedSaved)).toEqual({})
  })
})
