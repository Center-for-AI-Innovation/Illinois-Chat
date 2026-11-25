import { type CourseMetadata } from '~/types/courseMetadata'

/** On/off state of the prompt page's switches, as the editors track it. */
export interface PromptSwitchState {
  guidedLearning: boolean
  documentsOnly: boolean
  disableCitations?: boolean
  systemPromptOnly: boolean
  vectorSearchRewrite: boolean
  agentModeFeatureEnabled: boolean
}

/**
 * Returns the metadata fields for only the switches that differ from the last
 * saved state. Saves send just these, so switches another admin changed in
 * the meantime are left alone on the server.
 */
export function changedSwitchFields(
  current: PromptSwitchState,
  saved: PromptSwitchState,
): Partial<CourseMetadata> {
  const fields: Partial<CourseMetadata> = {}
  if (current.guidedLearning !== saved.guidedLearning)
    fields.guidedLearning = current.guidedLearning
  if (current.documentsOnly !== saved.documentsOnly)
    fields.documentsOnly = current.documentsOnly
  if (
    current.disableCitations !== undefined &&
    current.disableCitations !== saved.disableCitations
  )
    fields.disableCitations = current.disableCitations
  if (current.systemPromptOnly !== saved.systemPromptOnly)
    fields.systemPromptOnly = current.systemPromptOnly
  if (current.vectorSearchRewrite !== saved.vectorSearchRewrite)
    fields.vector_search_rewrite_disabled = !current.vectorSearchRewrite
  if (current.agentModeFeatureEnabled !== saved.agentModeFeatureEnabled)
    fields.agent_mode_enabled = current.agentModeFeatureEnabled
  return fields
}
