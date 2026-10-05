import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useFetchLLMProviders } from '~/hooks/queries/useFetchLLMProviders'
import { useUpdateProjectLLMProviders } from '~/hooks/queries/useUpdateProjectLLMProviders'
import {
  type AllLLMProviders,
  type AnySupportedModel,
  type AzureProvider,
  type BaseLLMProvider,
  type BedrockProvider,
  type LLMProvider,
  type ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import { showToast } from '~/utils/toastUtils'
import { withDefaultModel } from './withDefaultModel'

/** Credential / connection fields a provider card can save. */
export type ProviderFieldValues = Partial<
  Pick<BaseLLMProvider, 'apiKey' | 'baseUrl'> &
    Pick<AzureProvider, 'AzureEndpoint' | 'AzureDeployment'> &
    Pick<
      BedrockProvider,
      'region' | 'accessKeyId' | 'secretAccessKey' | 'inferenceProfileArn'
    >
>

function updateProvider(
  providers: AllLLMProviders,
  key: ProviderNames,
  update: (provider: LLMProvider) => LLMProvider,
): AllLLMProviders {
  const provider = providers[key]
  return provider ? { ...providers, [key]: update(provider) } : providers
}

/**
 * Data layer for the AI Models page. Call it ONCE, in the page, and pass the
 * actions down: the pending-change ref and the mutation's debounce live per
 * hook instance, so several instances would send competing payloads.
 *
 * Why it looks the way it does (see useUpdateProjectLLMProviders):
 * - The shared mutation is debounced (1s) and only sends the last payload of a
 *   batch, so every action sends the FULL provider state ("cumulative").
 * - It is not optimistic, so each action writes the query cache first.
 * - Its onSettled invalidates the query; a refetch can land while later
 *   changes are still queued and overwrite the cache with stale server data.
 *   Actions therefore build on `latestRef` (our pending state) rather than the
 *   cache while anything is in flight.
 * - mutateAsync resolves/rejects for EVERY call in a batch, so per-call code
 *   after the await (toasts, draft resets) always runs.
 *
 * Accepted edge case: if a batch fails after a later action was already built
 * on top of it, that later payload re-sends the failed change. The error toast
 * says so, and the onSettled refetch shows the true server state.
 */
export function useAIModelsSettings(projectName: string) {
  const queryClient = useQueryClient()
  const query = useFetchLLMProviders({ projectName })
  // mutateAsync is stable across renders, unlike the mutation object.
  const { mutateAsync } = useUpdateProjectLLMProviders(queryClient)

  const latestRef = useRef<AllLLMProviders | null>(null)
  const inFlightRef = useRef(0)

  const commit = useCallback(
    async (
      apply: (providers: AllLLMProviders) => AllLLMProviders,
    ): Promise<boolean> => {
      const queryKey = ['projectLLMProviders', projectName]
      const prev =
        latestRef.current ?? queryClient.getQueryData<AllLLMProviders>(queryKey)
      if (!prev) return false

      const next = apply(prev)
      latestRef.current = next
      inFlightRef.current += 1
      queryClient.setQueryData(queryKey, next)

      try {
        await mutateAsync({ projectName, llmProviders: next })
        showToast({
          title: 'Updated LLM providers',
          message: "Now your project's users can use the supplied LLMs!",
          type: 'success',
        })
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        showToast({
          title: 'Error updating LLM providers',
          message: `Some changes may not have saved: ${message}`,
          type: 'error',
        })
        return false
      } finally {
        inFlightRef.current -= 1
        if (inFlightRef.current === 0) latestRef.current = null
      }
    },
    [mutateAsync, projectName, queryClient],
  )

  const toggleProvider = useCallback(
    (provider: ProviderNames, enabled: boolean) =>
      commit((providers) =>
        updateProvider(providers, provider, (p) => ({ ...p, enabled })),
      ),
    [commit],
  )

  const toggleModel = useCallback(
    (provider: ProviderNames, modelId: string, enabled: boolean) =>
      commit((providers) =>
        updateProvider(
          providers,
          provider,
          (p) =>
            ({
              ...p,
              models: p.models?.map((m: AnySupportedModel) =>
                m.id === modelId ? { ...m, enabled } : m,
              ),
            }) as LLMProvider,
        ),
      ),
    [commit],
  )

  const setDefaultModel = useCallback(
    (model: { id: string; provider: ProviderNames }) =>
      commit((providers) => withDefaultModel(providers, model)),
    [commit],
  )

  const saveProviderFields = useCallback(
    (provider: ProviderNames, values: ProviderFieldValues) =>
      commit((providers) =>
        updateProvider(
          providers,
          provider,
          (p) => ({ ...p, ...values }) as LLMProvider,
        ),
      ),
    [commit],
  )

  return {
    llmProviders: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    toggleProvider,
    toggleModel,
    setDefaultModel,
    saveProviderFields,
  }
}

export type AIModelsSettings = ReturnType<typeof useAIModelsSettings>
