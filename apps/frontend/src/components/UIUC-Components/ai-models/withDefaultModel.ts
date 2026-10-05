import {
  type AllLLMProviders,
  type AnySupportedModel,
  type LLMProvider,
  type ProviderNames,
} from '~/utils/modelProviders/LLMProvider'

/**
 * Returns a copy of `providers` where exactly one model — `model.id` under
 * `model.provider` — is flagged `default`. Never mutates its input, so it is
 * safe to call on React Query cache data.
 */
export function withDefaultModel(
  providers: AllLLMProviders,
  model: { id: string; provider: ProviderNames },
): AllLLMProviders {
  const next = {} as AllLLMProviders
  for (const key of Object.keys(providers) as ProviderNames[]) {
    const provider = providers[key]
    next[key] = (
      provider?.models
        ? {
            ...provider,
            models: provider.models.map((m: AnySupportedModel) => ({
              ...m,
              default: key === model.provider && m.id === model.id,
            })),
          }
        : provider
    ) as LLMProvider
  }
  return next
}
