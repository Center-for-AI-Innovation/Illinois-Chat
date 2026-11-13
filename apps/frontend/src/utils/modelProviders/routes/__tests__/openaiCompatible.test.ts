import { describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  decryptKeyIfNeeded: vi.fn(async (k: string) => `dec:${k}`),
}))

vi.mock('~/utils/crypto', () => ({
  decryptKeyIfNeeded: hoisted.decryptKeyIfNeeded,
}))

import { getOpenAICompatibleModels } from '../openaiCompatible'
import { OpenAICompatibleModelID } from '../../types/openaiCompatible'
import {
  ProviderNames,
  ReasoningCapableModels,
  VisionCapableModels,
  type OpenAICompatibleProvider,
} from '../../LLMProvider'

describe('getOpenAICompatibleModels', () => {
  it('discovers Lumen chat models and aliases with capabilities and saved preferences', async () => {
    const catalog = [
      ['nemotron-3-super-120b-a12b', 262144, false],
      ['gemma-4-31b-it', 46790, true],
      ['ornith-1.0-35b', 262138, false],
      ['deepseek-v4-flash', 511994, false],
      ['muse-glimmer-30b', 131066, true],
      ['glm-5.3', 524282, false],
      ['glm', 524282, false],
      ['deepseek-v4.1-flash', 1048570, true],
      ['deepseek', 1048570, true],
      ['deepseek-v4.1', 1048570, true],
      ['beam-1.0', 524282, false],
    ] as const
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            ...catalog.map(([id]) => ({ id, owned_by: 'lumen' })),
            { id: 'granite-speech-4.1-2b-plus', input_modalities: ['audio'] },
          ],
        }),
      ),
    )
    const provider: OpenAICompatibleProvider = {
      provider: ProviderNames.OpenAICompatible,
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://lumen.ncsa.illinois.edu/v1',
      models: [
        {
          id: 'gemma-4-31b-it',
          name: 'Gemma',
          tokenLimit: 46790,
          enabled: false,
        },
        {
          id: 'deepseek',
          name: 'DeepSeek',
          tokenLimit: 1048570,
          enabled: true,
          default: true,
        },
      ],
    }

    const result = await getOpenAICompatibleModels(provider)

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://lumen.ncsa.illinois.edu/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer dec:test-key',
        }),
      }),
    )
    expect(result.error).toBeUndefined()
    expect(result.models).toHaveLength(catalog.length)
    for (const [id, tokenLimit, vision] of catalog) {
      expect(result.models?.find((model) => model.id === id)).toMatchObject({
        id,
        tokenLimit,
        name: expect.stringMatching(/^Lumen:/),
      })
      expect(ReasoningCapableModels.has(id as OpenAICompatibleModelID)).toBe(
        true,
      )
      expect(VisionCapableModels.has(id as OpenAICompatibleModelID)).toBe(
        vision,
      )
    }
    expect(
      result.models?.find((model) => model.id === 'gemma-4-31b-it')?.enabled,
    ).toBe(false)
    expect(
      result.models?.find((model) => model.id === 'deepseek'),
    ).toMatchObject({ enabled: true, default: true })
    for (const id of [
      'glm',
      'glm-5.3',
      'deepseek-v4-flash',
      'deepseek-v4.1-flash',
      'deepseek-v4.1',
    ]) {
      expect(result.models?.find((model) => model.id === id)?.enabled).toBe(
        false,
      )
    }
    expect(
      result.models?.find((model) => model.id === 'nemotron-3-super-120b-a12b')
        ?.enabled,
    ).toBe(true)
  })

  it('discovers additional Lumen Qwen models with their reported capabilities', async () => {
    const catalog = [
      ['qwen3-coder-next', 131066, false, false],
      ['qwen3.6-35b-a3b', 262138, false, true],
      ['qwen3.8-27b', 250542, true, true],
      ['qwen3.8-flash', 262138, true, false],
    ] as const
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: catalog.map(([id]) => ({ id })) })),
    )
    const provider: OpenAICompatibleProvider = {
      provider: ProviderNames.OpenAICompatible,
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://lumen.ncsa.illinois.edu/v1',
      models: [],
    }

    const result = await getOpenAICompatibleModels(provider)

    expect(result.error).toBeUndefined()
    expect(result.models).toHaveLength(catalog.length)
    for (const [id, tokenLimit, vision, reasoning] of catalog) {
      expect(result.models?.find((model) => model.id === id)).toMatchObject({
        id,
        tokenLimit,
        enabled: false,
        name: expect.stringMatching(/^Lumen:/),
      })
      expect(VisionCapableModels.has(id as OpenAICompatibleModelID)).toBe(
        vision,
      )
      expect(ReasoningCapableModels.has(id as OpenAICompatibleModelID)).toBe(
        reasoning,
      )
    }
  })

  it('only offers Lumen models available to the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'gemma-4-31b-it' }] })),
    )
    const provider: OpenAICompatibleProvider = {
      provider: ProviderNames.OpenAICompatible,
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://lumen.ncsa.illinois.edu/v1',
      models: [],
    }

    const result = await getOpenAICompatibleModels(provider)

    expect(result.models?.map((model) => model.id)).toEqual(['gemma-4-31b-it'])
  })

  it('requires baseUrl to include /v1', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const provider: any = {
      enabled: true,
      apiKey: 'k',
      baseUrl: 'https://api.example.com',
      models: [],
    }

    const result = await getOpenAICompatibleModels(provider)
    expect(result.models).toEqual([])
    expect(result.error).toMatch(/include \/v1/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns empty models when disabled or missing fields', async () => {
    const provider: any = {
      enabled: false,
      apiKey: '',
      baseUrl: '',
      models: [{ id: 'x' }],
    }
    const result = await getOpenAICompatibleModels(provider)
    expect(result.models).toEqual([])
  })

  it('filters to only endpoint-available models (case-insensitive) and preserves states', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'OPENAI/GPT-4O' }] }), {
        status: 200,
      }),
    )

    const provider: any = {
      enabled: true,
      apiKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [
        { id: OpenAICompatibleModelID.GPT_4o, enabled: false, default: true },
      ],
    }

    const result = await getOpenAICompatibleModels(provider)
    const models = result.models ?? []
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({
      id: OpenAICompatibleModelID.GPT_4o,
      enabled: false,
      default: true,
    })
  })

  it('sets error and clears models when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 500, statusText: 'fail' }),
    )

    const provider: any = {
      enabled: true,
      apiKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [{ id: OpenAICompatibleModelID.GPT_4o }],
    }

    const result = await getOpenAICompatibleModels(provider)
    expect(result.models).toEqual([])
    expect(result.error).toMatch(/failed to fetch models/i)
  })

  it('returns empty models when endpoint returns an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    )

    const provider: any = {
      enabled: true,
      apiKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [{ id: OpenAICompatibleModelID.GPT_4o, enabled: true }],
    }

    const result = await getOpenAICompatibleModels(provider)
    expect(result.models).toEqual([])
    expect(result.error).toBeUndefined()
  })

  it('sets error when models endpoint returns an unexpected format', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    )

    const provider: any = {
      enabled: true,
      apiKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [],
    }

    const result = await getOpenAICompatibleModels(provider)
    expect(result.models).toEqual([])
    expect(result.error).toMatch(/unexpected response format/i)
  })

  it('uses a fallback error message when error.message is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error(''))

    const provider: any = {
      enabled: true,
      apiKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [],
    }

    const result = await getOpenAICompatibleModels(provider)
    expect(result.models).toEqual([])
    expect(result.error).toMatch(/failed to fetch available models/i)
  })

  it('uses "Unknown error" when fetch throws a non-Error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce('boom')

    const provider: any = {
      enabled: true,
      apiKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [],
    }

    const result = await getOpenAICompatibleModels(provider)
    expect(result.models).toEqual([])
    expect(result.error).toBe('Unknown error')
  })

  it('handles outer errors and clears models', async () => {
    hoisted.decryptKeyIfNeeded.mockRejectedValueOnce(new Error('badkey'))

    const provider: any = {
      enabled: true,
      apiKey: 'k',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [{ id: OpenAICompatibleModelID.GPT_4o }],
    }

    const result = await getOpenAICompatibleModels(provider)
    expect(result.models).toEqual([])
    expect(result.error).toMatch(/badkey/i)
  })
})
