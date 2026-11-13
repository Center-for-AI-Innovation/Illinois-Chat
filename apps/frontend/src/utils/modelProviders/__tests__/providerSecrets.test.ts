/* @vitest-environment node */

import { describe, expect, it } from 'vitest'

import { type AllLLMProviders } from '../LLMProvider'
import {
  REDACTED_SECRET,
  redactProviderSecrets,
  restoreRedactedSecrets,
} from '../providerSecrets'

const asProviders = (value: Record<string, unknown>) =>
  value as unknown as AllLLMProviders

describe('redactProviderSecrets', () => {
  it('passes missing providers through unchanged', () => {
    const result = redactProviderSecrets(
      asProviders({ OpenAI: undefined, Anthropic: null }),
    ) as unknown as Record<string, unknown>

    expect(result).toEqual({ OpenAI: undefined, Anthropic: null })
    expect('OpenAI' in result).toBe(true)
  })

  it('redacts set secret fields and leaves empty ones alone', () => {
    const result = redactProviderSecrets(
      asProviders({
        Bedrock: {
          enabled: true,
          accessKeyId: 'AKIA',
          secretAccessKey: 'secret',
          apiKey: '',
        },
      }),
    ) as unknown as Record<string, Record<string, unknown>>

    expect(result.Bedrock).toEqual({
      enabled: true,
      accessKeyId: REDACTED_SECRET,
      secretAccessKey: REDACTED_SECRET,
      apiKey: '',
    })
  })
})

describe('restoreRedactedSecrets', () => {
  it('passes missing providers through unchanged', () => {
    const result = restoreRedactedSecrets(
      asProviders({ OpenAI: undefined, Anthropic: null }),
      { OpenAI: { apiKey: 'sk-stored' } },
    ) as unknown as Record<string, unknown>

    expect(result).toEqual({ OpenAI: undefined, Anthropic: null })
    expect('OpenAI' in result).toBe(true)
  })

  it('still restores real providers alongside missing ones', () => {
    const result = restoreRedactedSecrets(
      asProviders({
        OpenAI: { enabled: true, apiKey: REDACTED_SECRET },
        Anthropic: undefined,
      }),
      { OpenAI: { apiKey: 'sk-stored' } },
    ) as unknown as Record<string, Record<string, unknown> | undefined>

    expect(result.OpenAI).toEqual({ enabled: true, apiKey: 'sk-stored' })
    expect(result.Anthropic).toBeUndefined()
  })

  it('drops a placeholder that has no stored value', () => {
    const result = restoreRedactedSecrets(
      asProviders({ OpenAI: { enabled: true, apiKey: REDACTED_SECRET } }),
      {},
    ) as unknown as Record<string, Record<string, unknown>>

    expect(result.OpenAI).toEqual({ enabled: true })
  })
})
