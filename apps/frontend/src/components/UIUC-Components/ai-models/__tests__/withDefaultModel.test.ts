import { describe, expect, it } from 'vitest'
import {
  type AllLLMProviders,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import { withDefaultModel } from '../withDefaultModel'

const providers = {
  [ProviderNames.OpenAI]: {
    provider: ProviderNames.OpenAI,
    enabled: true,
    models: [
      { id: 'gpt-a', name: 'A', enabled: true, default: true },
      { id: 'gpt-b', name: 'B', enabled: true, default: false },
    ],
  },
  [ProviderNames.Anthropic]: {
    provider: ProviderNames.Anthropic,
    enabled: true,
    models: [{ id: 'claude-a', name: 'C', enabled: true, default: false }],
  },
  [ProviderNames.Ollama]: { provider: ProviderNames.Ollama, enabled: false },
} as unknown as AllLLMProviders

describe('withDefaultModel', () => {
  it('flags exactly one model as default across all providers', () => {
    const next = withDefaultModel(providers, {
      id: 'claude-a',
      provider: ProviderNames.Anthropic,
    })

    const defaults = Object.values(next).flatMap((p) =>
      (p.models ?? []).filter((m) => m.default).map((m) => m.id),
    )
    expect(defaults).toEqual(['claude-a'])
  })

  it('matches on provider as well as id', () => {
    const next = withDefaultModel(providers, {
      id: 'gpt-b',
      provider: ProviderNames.Anthropic,
    })

    expect(next[ProviderNames.OpenAI].models?.[1]?.default).toBe(false)
  })

  it('does not mutate its input and keeps providers without models', () => {
    const snapshot = structuredClone(providers)
    const next = withDefaultModel(providers, {
      id: 'gpt-b',
      provider: ProviderNames.OpenAI,
    })

    expect(providers).toEqual(snapshot)
    expect(next[ProviderNames.Ollama]).toBe(providers[ProviderNames.Ollama])
  })
})
