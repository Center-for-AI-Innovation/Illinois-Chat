/* @vitest-environment node */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'

vi.mock('~/utils/crypto', () => ({
  decryptKeyIfNeeded: vi.fn(async (k: string) => k),
}))

import { runOllamaChat } from '../ollama'
import { OllamaModelIDs } from '~/utils/modelProviders/ollama'

function conversation(modelId: string): any {
  return {
    model: { id: modelId, tokenLimit: 8192 },
    temperature: 0.1,
    messages: [{ role: 'user', content: 'hi' }],
  }
}

function sentAuthHeader(fetchSpy: MockInstance<typeof fetch>) {
  const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
  return new Headers(init?.headers).get('authorization')
}

describe('runOllamaChat credential handling', () => {
  let fetchSpy: MockInstance<typeof fetch>

  beforeEach(() => {
    vi.stubEnv('OLLAMA_SERVER_URL', 'https://ollama.ncsa.example')
    vi.stubEnv('NCSA_HOSTED_API_KEY', 'ncsa-secret')
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  // Reasoning models take the hand-rolled fetch path; others go through
  // createOllama. Both must withhold the key from user-configured hosts.
  it.each([
    ['reasoning stream', OllamaModelIDs.QWEN3_32B, true],
    ['createOllama', OllamaModelIDs.LLAMA32_1b_fp16, false],
  ])(
    'does not send NCSA_HOSTED_API_KEY to a project baseUrl (%s)',
    async (_label, modelId, stream) => {
      await runOllamaChat(
        conversation(modelId),
        { baseUrl: 'https://attacker.example' } as any,
        stream,
      )
      expect(fetchSpy).toHaveBeenCalled()
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(
        'attacker.example',
      )
      expect(sentAuthHeader(fetchSpy)).toBeNull()
    },
  )

  it.each([
    ['reasoning stream', OllamaModelIDs.QWEN3_32B, true],
    ['createOllama', OllamaModelIDs.LLAMA32_1b_fp16, false],
  ])(
    'sends NCSA_HOSTED_API_KEY to the env NCSA endpoint (%s)',
    async (_label, modelId, stream) => {
      await runOllamaChat(conversation(modelId), {} as any, stream)
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(
        'ollama.ncsa.example',
      )
      expect(sentAuthHeader(fetchSpy)).toBe('Bearer ncsa-secret')
    },
  )
})
