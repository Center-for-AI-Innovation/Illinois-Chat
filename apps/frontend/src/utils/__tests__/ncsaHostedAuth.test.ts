/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isNCSAHostedUrl,
  isSameOriginAsAny,
  ncsaHostedAuthHeaders,
} from '../ncsaHostedAuth'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isSameOriginAsAny', () => {
  it('matches on scheme, host and port only', () => {
    expect(
      isSameOriginAsAny('https://ncsa.example/api/chat', [
        'https://ncsa.example',
      ]),
    ).toBe(true)
    expect(
      isSameOriginAsAny('https://ncsa.example:443/x', ['https://ncsa.example']),
    ).toBe(true)
  })

  it.each([
    'https://attacker.example',
    'http://ncsa.example',
    'https://ncsa.example:8443',
    'https://ncsa.example.attacker.example',
    'https://ncsa.example@attacker.example',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isSameOriginAsAny(url, ['https://ncsa.example'])).toBe(false)
  })

  it('never matches against an unset trusted URL', () => {
    expect(isSameOriginAsAny('https://x.example', [undefined, ''])).toBe(false)
  })
})

describe('ncsaHostedAuthHeaders', () => {
  it('attaches the key only for the env-configured NCSA endpoints', () => {
    vi.stubEnv('OLLAMA_SERVER_URL', 'https://ollama.ncsa.example')
    vi.stubEnv('NCSA_HOSTED_VLM_BASE_URL', 'https://vlm.ncsa.example/v1')
    vi.stubEnv('NCSA_HOSTED_API_KEY', 'ncsa-secret')

    expect(ncsaHostedAuthHeaders('https://ollama.ncsa.example')).toEqual({
      Authorization: 'Bearer ncsa-secret',
    })
    expect(isNCSAHostedUrl('https://vlm.ncsa.example/v1/models')).toBe(true)
    expect(ncsaHostedAuthHeaders('https://attacker.example')).toEqual({})
  })

  it('sends no header when the key is unset', () => {
    vi.stubEnv('OLLAMA_SERVER_URL', 'https://ollama.ncsa.example')
    vi.stubEnv('NCSA_HOSTED_API_KEY', '')
    expect(ncsaHostedAuthHeaders('https://ollama.ncsa.example')).toEqual({})
  })
})
