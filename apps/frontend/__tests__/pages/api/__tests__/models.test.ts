/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'
import { ProviderNames } from '~/utils/modelProviders/LLMProvider'
import { REDACTED_SECRET } from '~/utils/modelProviders/providerSecrets'

const hoisted = vi.hoisted(() => ({
  redisGet: vi.fn(),
  cacheGet: vi.fn(async (): Promise<string | null> => null),
  redisSet: vi.fn(),
  getOllamaModels: vi.fn(async (p: any) => p),
  getAzureModels: vi.fn(async (p: any) => p),
  getAnthropicModels: vi.fn(async (p: any) => p),
  getWebLLMModels: vi.fn(async (p: any) => p),
  getNCSAHostedModels: vi.fn(async (p: any) => p),
  getOpenAIModels: vi.fn(async (p: any) => p),
  getNCSAHostedVLMModels: vi.fn(async (p: any) => p),
  getBedrockModels: vi.fn(async (p: any) => p),
  getGeminiModels: vi.fn(async (p: any) => p),
  getSambaNovaModels: vi.fn(async (p: any) => p),
  getOpenAICompatibleModels: vi.fn(async (p: any) => p),
}))

vi.mock('~/server/authorization', () => ({
  withCourseAccessFromRequest: () => (h: any) => h,
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(async () => ({
    get: (key: string) =>
      key.endsWith('-llms-resolved')
        ? hoisted.cacheGet()
        : hoisted.redisGet(key),
    set: hoisted.redisSet,
  })),
}))

vi.mock('~/utils/modelProviders/ollama', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    getOllamaModels: hoisted.getOllamaModels,
  }
})
vi.mock('~/utils/modelProviders/azure', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    getAzureModels: hoisted.getAzureModels,
  }
})
vi.mock('~/utils/modelProviders/routes/anthropic', () => ({
  getAnthropicModels: hoisted.getAnthropicModels,
}))
vi.mock('~/utils/modelProviders/WebLLM', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    getWebLLMModels: hoisted.getWebLLMModels,
  }
})
vi.mock('~/utils/modelProviders/NCSAHosted', () => ({
  getNCSAHostedModels: hoisted.getNCSAHostedModels,
}))
vi.mock('~/utils/modelProviders/routes/openai', () => ({
  getOpenAIModels: hoisted.getOpenAIModels,
}))
vi.mock(
  '~/utils/modelProviders/types/NCSAHostedVLM',
  async (importOriginal) => {
    const actual = await importOriginal<any>()
    return {
      ...actual,
      getNCSAHostedVLMModels: hoisted.getNCSAHostedVLMModels,
    }
  },
)
vi.mock('~/utils/modelProviders/routes/bedrock', () => ({
  getBedrockModels: hoisted.getBedrockModels,
}))
vi.mock('~/utils/modelProviders/routes/gemini', () => ({
  getGeminiModels: hoisted.getGeminiModels,
}))
vi.mock('~/utils/modelProviders/routes/sambanova', () => ({
  getSambaNovaModels: hoisted.getSambaNovaModels,
}))
vi.mock('~/utils/modelProviders/routes/openaiCompatible', () => ({
  getOpenAICompatibleModels: hoisted.getOpenAICompatibleModels,
}))

import handler, { getModels } from '~/pages/api/models'

describe('models API', () => {
  it('getModels returns providers even when redis has no config', async () => {
    hoisted.redisGet.mockResolvedValueOnce(null)

    const out = await getModels('CS101')
    expect(out).toBeTruthy()

    const keys = Object.keys(out as any)
    for (const provider of Object.values(ProviderNames)) {
      expect(keys).toContain(provider)
    }
  })

  it('handler returns 400 when projectName is missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: {} }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('handler returns 200 with all providers', async () => {
    hoisted.redisGet.mockResolvedValueOnce(JSON.stringify({}))
    const res = createMockRes()

    await handler(
      createMockReq({ method: 'POST', body: { projectName: 'CS101' } }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    const body = (res.json as any).mock.calls[0]?.[0]
    expect(body[ProviderNames.OpenAI]).toBeTruthy()
    expect(body[ProviderNames.Azure]).toBeTruthy()
  })

  it('handler never returns stored secrets', async () => {
    hoisted.redisGet.mockResolvedValueOnce(
      JSON.stringify({
        OpenAICompatible: {
          enabled: true,
          baseUrl: 'https://provider.example/v1',
          apiKey: 'v1.ciphertext.iv',
          models: [],
        },
        Bedrock: {
          enabled: true,
          accessKeyId: 'AKIAPLAINTEXT',
          secretAccessKey: 'plaintext-secret',
          region: 'us-east-1',
          models: [],
        },
        Anthropic: { enabled: true, apiKey: '', models: [] },
      }),
    )
    const res = createMockRes()

    await handler(
      createMockReq({ method: 'POST', body: { projectName: 'CS101' } }) as any,
      res as any,
    )

    const body = (res.json as any).mock.calls[0]?.[0]
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('v1.ciphertext.iv')
    expect(serialized).not.toContain('AKIAPLAINTEXT')
    expect(serialized).not.toContain('plaintext-secret')
    expect(body.OpenAICompatible.apiKey).toBe(REDACTED_SECRET)
    expect(body.OpenAICompatible.baseUrl).toBe('https://provider.example/v1')
    expect(body.Bedrock.accessKeyId).toBe(REDACTED_SECRET)
    expect(body.Bedrock.secretAccessKey).toBe(REDACTED_SECRET)
    expect(body.Anthropic.apiKey).toBe('')
  })

  it('getModels still returns stored secrets for server-side callers', async () => {
    hoisted.redisGet.mockResolvedValueOnce(
      JSON.stringify({
        OpenAICompatible: { enabled: true, apiKey: 'v1.ciphertext.iv' },
      }),
    )
    const out = await getModels('CS101')
    expect((out as any).OpenAICompatible.apiKey).toBe('v1.ciphertext.iv')
  })

  it('getModels serves a cached result without re-listing models', async () => {
    hoisted.cacheGet.mockResolvedValueOnce(
      JSON.stringify({ OpenAI: { apiKey: 'v1.cached', models: [] } }),
    )
    hoisted.getOpenAIModels.mockClear()
    hoisted.redisGet.mockClear()

    const out = await getModels('CS101')

    expect((out as any).OpenAI.apiKey).toBe('v1.cached')
    expect(hoisted.redisGet).not.toHaveBeenCalled()
    expect(hoisted.getOpenAIModels).not.toHaveBeenCalled()
  })

  it('getModels caches a resolved result with a TTL', async () => {
    hoisted.redisGet.mockResolvedValueOnce(JSON.stringify({}))
    hoisted.redisSet.mockClear()

    await getModels('CS101')

    expect(hoisted.redisSet).toHaveBeenCalledWith(
      'CS101-llms-resolved',
      expect.any(String),
      { EX: 60 },
    )
  })

  it('getModels caches a result even when a provider reports an error', async () => {
    hoisted.redisGet.mockResolvedValueOnce(JSON.stringify({}))
    hoisted.getOllamaModels.mockImplementationOnce(async (p: any) => ({
      ...p,
      error: 'endpoint down',
    }))
    hoisted.redisSet.mockClear()

    await getModels('CS101')

    expect(hoisted.redisSet).toHaveBeenCalledWith(
      'CS101-llms-resolved',
      expect.stringContaining('endpoint down'),
      { EX: 60 },
    )
  })

  it('handler returns 500 when getModels throws', async () => {
    hoisted.redisGet.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const res = createMockRes()

    await handler(
      createMockReq({ method: 'POST', body: { projectName: 'CS101' } }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(500)
  })
})
