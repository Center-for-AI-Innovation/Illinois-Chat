import { type AllLLMProviders } from './LLMProvider'

// Sent to clients in place of a stored secret
// Stored since PromptEditor checks for the presence to know if provider is set up
export const REDACTED_SECRET = '__stored_secret__'

const SECRET_FIELDS = ['apiKey', 'accessKeyId', 'secretAccessKey'] as const

type ProviderRecord = Record<string, unknown>

export function redactProviderSecrets(
  providers: AllLLMProviders,
): AllLLMProviders {
  const redacted: Record<string, unknown> = {}
  for (const [name, provider] of Object.entries(providers)) {
    if (!provider) {
      redacted[name] = provider
      continue
    }
    const copy: ProviderRecord = { ...provider }
    for (const field of SECRET_FIELDS) {
      if (copy[field]) copy[field] = REDACTED_SECRET
    }
    redacted[name] = copy
  }
  return redacted as AllLLMProviders
}

// Swap placeholders echoed back by the admin form for the stored values.
export function restoreRedactedSecrets(
  incoming: AllLLMProviders,
  stored: Partial<Record<string, unknown>>,
): AllLLMProviders {
  const restored: Record<string, unknown> = {}
  for (const [name, provider] of Object.entries(incoming)) {
    if (!provider) {
      restored[name] = provider
      continue
    }
    const copy: ProviderRecord = { ...provider }
    const storedProvider = stored[name] as ProviderRecord | undefined
    for (const field of SECRET_FIELDS) {
      if (copy[field] !== REDACTED_SECRET) continue
      const storedValue = storedProvider?.[field]
      if (storedValue) copy[field] = storedValue
      else delete copy[field]
    }
    restored[name] = copy
  }
  return restored as AllLLMProviders
}
