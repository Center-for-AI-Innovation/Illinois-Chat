import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'
import { REDACTED_SECRET } from '~/utils/modelProviders/providerSecrets'

const hoisted = vi.hoisted(() => {
  return {
    ensureRedisConnected: vi.fn(),
    encryptKeyIfNeeded: vi.fn(async (k: string) => `enc:${k}`),
    redisGet: vi.fn(),
    redisSet: vi.fn(),
    redisDel: vi.fn(),
  }
})

vi.mock('~/server/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
}))

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: hoisted.ensureRedisConnected,
}))

vi.mock('~/utils/crypto', () => ({
  encryptKeyIfNeeded: hoisted.encryptKeyIfNeeded,
}))

import handler from '~/pages/api/UIUC-api/upsertLLMProviders'

describe('UIUC-api/upsertLLMProviders', () => {
  it('returns 405 for non-POST', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns 400 for missing/invalid params', async () => {
    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      get: hoisted.redisGet,
      set: hoisted.redisSet,
    })
    const res1 = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: {} }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(400)

    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      get: hoisted.redisGet,
      set: hoisted.redisSet,
    })
    const res2 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { projectName: 'CS101', llmProviders: null },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(400)
  })

  it('encrypts provider keys and saves combined providers', async () => {
    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      get: hoisted.redisGet.mockResolvedValueOnce(
        JSON.stringify({ OpenAI: { apiKey: 'old' } }),
      ),
      set: hoisted.redisSet.mockResolvedValueOnce(undefined),
      del: hoisted.redisDel,
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          projectName: 'CS101',
          llmProviders: { Anthropic: { apiKey: 'k', models: [] } },
        },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(hoisted.encryptKeyIfNeeded).toHaveBeenCalledWith('k')
    expect(hoisted.redisSet).toHaveBeenCalled()
    expect(hoisted.redisDel).toHaveBeenCalledWith('CS101-llms-resolved')
  })

  it('keeps stored secrets when the form sends back the placeholder', async () => {
    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      get: hoisted.redisGet.mockResolvedValueOnce(
        JSON.stringify({
          OpenAI: { apiKey: 'v1.stored.openai' },
          Bedrock: { accessKeyId: 'v1.stored.id', secretAccessKey: 'v1.s.k' },
        }),
      ),
      set: hoisted.redisSet.mockResolvedValueOnce(undefined),
      del: hoisted.redisDel,
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          projectName: 'CS101',
          llmProviders: {
            OpenAI: { apiKey: REDACTED_SECRET, enabled: false, models: [] },
            Bedrock: {
              accessKeyId: REDACTED_SECRET,
              secretAccessKey: REDACTED_SECRET,
              models: [],
            },
            Anthropic: { apiKey: REDACTED_SECRET, models: [] },
          },
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    const saved = JSON.parse(hoisted.redisSet.mock.calls[0]![1])
    expect(saved.OpenAI.apiKey).toBe('enc:v1.stored.openai')
    expect(saved.OpenAI.enabled).toBe(false)
    expect(saved.Bedrock.accessKeyId).toBe('enc:v1.stored.id')
    expect(saved.Bedrock.secretAccessKey).toBe('enc:v1.s.k')
    // No stored Anthropic key, so the placeholder must not be saved as one.
    expect(saved.Anthropic.apiKey).toBeUndefined()
    expect(JSON.stringify(saved)).not.toContain(REDACTED_SECRET)
  })

  it('encrypts Bedrock credentials before saving', async () => {
    hoisted.ensureRedisConnected.mockResolvedValueOnce({
      get: hoisted.redisGet.mockResolvedValueOnce('{}'),
      set: hoisted.redisSet.mockResolvedValueOnce(undefined),
      del: hoisted.redisDel,
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          projectName: 'CS101',
          llmProviders: {
            Bedrock: {
              accessKeyId: 'AKIA',
              secretAccessKey: 'shh',
              models: [],
            },
          },
        },
      }) as any,
      res as any,
    )

    const saved = JSON.parse(hoisted.redisSet.mock.calls[0]![1])
    expect(saved.Bedrock.accessKeyId).toBe('enc:AKIA')
    expect(saved.Bedrock.secretAccessKey).toBe('enc:shh')
  })
})
