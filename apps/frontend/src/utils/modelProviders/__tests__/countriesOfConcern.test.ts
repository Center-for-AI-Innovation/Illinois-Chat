import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COUNTRY_OF_CONCERN_INFO_URL,
  CountryOfConcern,
  getCountryOfConcern,
  COUNTRY_OF_CONCERN_WARNING,
  getCountryOfConcernBannerLede,
  isCocBannerDismissed,
  isCountryOfConcern,
  isDeepSeekModel,
  isDeepSeekNoticeDismissed,
  isLocallyHostedProvider,
  isChatbotCocAcknowledged,
  markChatbotCocAcknowledged,
  markCocBannerDismissed,
  markDeepSeekNoticeDismissed,
} from '~/utils/modelProviders/countriesOfConcern'

const CHAT_KEY = 'coc-acknowledged-chatbots'
const BANNER_KEY = 'coc-banner-dismissed-pairs'
const DEEPSEEK_KEY = 'deepseek-directive-dismissed-pairs'

describe('getCountryOfConcern / isCountryOfConcern', () => {
  it('returns null for missing input', () => {
    expect(getCountryOfConcern(null)).toBeNull()
    expect(getCountryOfConcern(undefined)).toBeNull()
    expect(getCountryOfConcern('')).toBeNull()
    expect(isCountryOfConcern(null)).toBe(false)
  })

  it('returns null for unrecognized model ids', () => {
    expect(getCountryOfConcern('totally-not-a-real-model')).toBeNull()
    expect(isCountryOfConcern('totally-not-a-real-model')).toBe(false)
  })

  it('returns the country for a known flagged model id', () => {
    expect(getCountryOfConcern('deepseek/deepseek-chat-v3-0324')).toBe(
      CountryOfConcern.China,
    )
    expect(isCountryOfConcern('deepseek/deepseek-chat-v3-0324')).toBe(true)
  })

  it('matches registered ids case-insensitively', () => {
    // Upstream catalogs disagree on casing for the same model; a casing
    // difference must not unflag it (and thus re-enable it by default).
    expect(getCountryOfConcern('DEEPSEEK/DeepSeek-Chat-V3-0324')).toBe(
      CountryOfConcern.China,
    )
    expect(getCountryOfConcern('qwen/qwen2.5-vl-72b-instruct')).toBe(
      CountryOfConcern.China,
    )
    expect(getCountryOfConcern('Qwen/Qwen2.5-VL-72B-Instruct')).toBe(
      CountryOfConcern.China,
    )
  })

  it('ignores surrounding whitespace', () => {
    expect(getCountryOfConcern('  deepseek/deepseek-chat-v3-0324  ')).toBe(
      CountryOfConcern.China,
    )
    expect(getCountryOfConcern('   ')).toBeNull()
  })

  it('flags unregistered models by vendor family (fails closed)', () => {
    // None of these ids are in the explicit registry. A future release or a
    // varying Ollama tag must still be flagged rather than silently exempt.
    expect(getCountryOfConcern('deepseek/deepseek-v4-preview')).toBe(
      CountryOfConcern.China,
    )
    expect(getCountryOfConcern('deepseek-r1:8b')).toBe(CountryOfConcern.China)
    expect(getCountryOfConcern('qwen3:14b')).toBe(CountryOfConcern.China)
    expect(getCountryOfConcern('z-ai/glm-4.7')).toBe(CountryOfConcern.China)
    expect(getCountryOfConcern('moonshotai/kimi-k3')).toBe(
      CountryOfConcern.China,
    )
    expect(getCountryOfConcern('minimax/minimax-m3')).toBe(
      CountryOfConcern.China,
    )
  })

  it('does not flag models from unaffected vendors', () => {
    for (const id of [
      'gpt-5.5',
      'claude-opus-4-20250514',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'gemini-2.5-pro',
      'meta-llama/llama-3.3-70b-instruct',
      'mistralai/mistral-large',
    ]) {
      expect(getCountryOfConcern(id)).toBeNull()
    }
  })
})

describe('isLocallyHostedProvider', () => {
  it('treats university-controlled and in-browser providers as local', () => {
    expect(isLocallyHostedProvider('NCSAHosted')).toBe(true)
    expect(isLocallyHostedProvider('NCSAHostedVLM')).toBe(true)
    expect(isLocallyHostedProvider('Ollama')).toBe(true)
    expect(isLocallyHostedProvider('WebLLM')).toBe(true)
  })

  it('treats third-party providers as not local', () => {
    expect(isLocallyHostedProvider('OpenAICompatible')).toBe(false)
    expect(isLocallyHostedProvider('OpenAI')).toBe(false)
    expect(isLocallyHostedProvider('Anthropic')).toBe(false)
  })

  it('treats unknown or missing provider as not local', () => {
    // Fail closed: if we cannot resolve the provider we must not promise
    // that data stays on university infrastructure.
    expect(isLocallyHostedProvider(undefined)).toBe(false)
    expect(isLocallyHostedProvider(null)).toBe(false)
    expect(isLocallyHostedProvider('')).toBe(false)
    expect(isLocallyHostedProvider('SomeNewProvider')).toBe(false)
  })
})

describe('getCountryOfConcernBannerLede', () => {
  it('only claims local hosting when the model is locally hosted', () => {
    const local = getCountryOfConcernBannerLede(true)
    expect(local).toContain('hosted locally at the U of I')
    expect(local).toContain('does not send your conversation to external')
  })

  it('warns that data leaves the university for third-party-served models', () => {
    const remote = getCountryOfConcernBannerLede(false)
    expect(remote).toContain('leaves university infrastructure')
    expect(remote).toContain('rather than hosted locally')
    // Must never reassure the user that their data stays put on a model
    // served by a third party — that was the original bug.
    expect(remote).not.toContain('does not send your conversation')
  })
})

describe('message helpers', () => {
  it('warning matches the expected text', () => {
    expect(COUNTRY_OF_CONCERN_WARNING).toBe(
      'This model was trained in a US government designated Country of Concern. ' +
        'It may exhibit biases based on differences in geopolitical environments, ' +
        'cultural norms, policy constraints, or censorship behaviors.',
    )
  })

  it('exposes a canonical info URL', () => {
    expect(COUNTRY_OF_CONCERN_INFO_URL).toMatch(/^https:\/\//)
  })
})

describe('isChatbotCocAcknowledged / markChatbotCocAcknowledged', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns false for missing chatbot id', () => {
    expect(isChatbotCocAcknowledged(null)).toBe(false)
    expect(isChatbotCocAcknowledged(undefined)).toBe(false)
    expect(isChatbotCocAcknowledged('')).toBe(false)
  })

  it('returns false when storage is empty', () => {
    expect(isChatbotCocAcknowledged('bot-a')).toBe(false)
  })

  it('mark + read round-trip persists', () => {
    markChatbotCocAcknowledged('bot-a')
    expect(isChatbotCocAcknowledged('bot-a')).toBe(true)
    expect(isChatbotCocAcknowledged('bot-b')).toBe(false)
  })

  it('marking is idempotent (early return when already in set)', () => {
    markChatbotCocAcknowledged('bot-a')
    markChatbotCocAcknowledged('bot-a')
    const raw = window.localStorage.getItem(CHAT_KEY)
    expect(raw && JSON.parse(raw)).toEqual(['bot-a'])
  })

  it('mark is a no-op for empty id', () => {
    markChatbotCocAcknowledged('')
    expect(window.localStorage.getItem(CHAT_KEY)).toBeNull()
  })

  it('treats corrupt JSON in storage as empty set', () => {
    window.localStorage.setItem(CHAT_KEY, '{not json')
    expect(isChatbotCocAcknowledged('bot-a')).toBe(false)
  })

  it('treats non-array JSON in storage as empty set', () => {
    window.localStorage.setItem(CHAT_KEY, JSON.stringify({ foo: 'bar' }))
    expect(isChatbotCocAcknowledged('bot-a')).toBe(false)
  })

  it('filters out non-string entries when reading', () => {
    window.localStorage.setItem(CHAT_KEY, JSON.stringify(['bot-a', 42, null]))
    expect(isChatbotCocAcknowledged('bot-a')).toBe(true)
  })

  it('swallows localStorage.setItem failures', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })
    expect(() => markChatbotCocAcknowledged('bot-a')).not.toThrow()
    spy.mockRestore()
  })
})

describe('isCocBannerDismissed / markCocBannerDismissed', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns false for missing chatbot id or model id', () => {
    expect(isCocBannerDismissed(null, 'm')).toBe(false)
    expect(isCocBannerDismissed('c', null)).toBe(false)
    expect(isCocBannerDismissed(null, null)).toBe(false)
    expect(isCocBannerDismissed('', 'm')).toBe(false)
    expect(isCocBannerDismissed('c', '')).toBe(false)
  })

  it('returns false when storage is empty', () => {
    expect(isCocBannerDismissed('bot-a', 'qwen/qwen3-32b')).toBe(false)
  })

  it('mark + read round-trip persists per pair', () => {
    markCocBannerDismissed('bot-a', 'qwen/qwen3-32b')
    expect(isCocBannerDismissed('bot-a', 'qwen/qwen3-32b')).toBe(true)
    // different model on same chatbot — banner should still fire
    expect(isCocBannerDismissed('bot-a', 'deepseek/deepseek-chat-v3.1')).toBe(
      false,
    )
    // same model on different chatbot — banner should still fire
    expect(isCocBannerDismissed('bot-b', 'qwen/qwen3-32b')).toBe(false)
  })

  it('marking is idempotent (early return when pair already dismissed)', () => {
    markCocBannerDismissed('bot-a', 'qwen/qwen3-32b')
    markCocBannerDismissed('bot-a', 'qwen/qwen3-32b')
    const raw = window.localStorage.getItem(BANNER_KEY)
    expect(raw && JSON.parse(raw)).toEqual(['bot-a::qwen/qwen3-32b'])
  })

  it('mark is a no-op for empty inputs', () => {
    markCocBannerDismissed('', 'm')
    markCocBannerDismissed('c', '')
    expect(window.localStorage.getItem(BANNER_KEY)).toBeNull()
  })

  it('treats corrupt JSON in storage as empty set', () => {
    window.localStorage.setItem(BANNER_KEY, 'totally not json')
    expect(isCocBannerDismissed('bot-a', 'qwen/qwen3-32b')).toBe(false)
  })

  it('treats non-array JSON in storage as empty set', () => {
    window.localStorage.setItem(BANNER_KEY, JSON.stringify({ foo: 'bar' }))
    expect(isCocBannerDismissed('bot-a', 'qwen/qwen3-32b')).toBe(false)
  })

  it('filters out non-string entries when reading', () => {
    window.localStorage.setItem(
      BANNER_KEY,
      JSON.stringify(['bot-a::qwen/qwen3-32b', 99]),
    )
    expect(isCocBannerDismissed('bot-a', 'qwen/qwen3-32b')).toBe(true)
  })

  it('swallows localStorage.setItem failures', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })
    expect(() =>
      markCocBannerDismissed('bot-a', 'qwen/qwen3-32b'),
    ).not.toThrow()
    spy.mockRestore()
  })
})

describe('isDeepSeekModel', () => {
  it('matches OpenRouter and Ollama DeepSeek ids case-insensitively', () => {
    expect(isDeepSeekModel('deepseek/deepseek-v3.2')).toBe(true)
    expect(isDeepSeekModel('deepseek-r1:70b')).toBe(true)
    expect(isDeepSeekModel('DeepSeek/DeepSeek-R1-Zero')).toBe(true)
  })

  it('does not match other models or empty ids', () => {
    expect(isDeepSeekModel('qwen/qwen3-32b')).toBe(false)
    expect(isDeepSeekModel('z-ai/glm-4.6')).toBe(false)
    expect(isDeepSeekModel('gpt-4o')).toBe(false)
    expect(isDeepSeekModel(null)).toBe(false)
    expect(isDeepSeekModel('')).toBe(false)
  })
})

describe('isDeepSeekNoticeDismissed / markDeepSeekNoticeDismissed', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('stays visible for users who already dismissed the CoC banner', () => {
    markCocBannerDismissed('bot-a', 'deepseek-r1:70b')
    expect(isDeepSeekNoticeDismissed('bot-a', 'deepseek-r1:70b')).toBe(false)
  })

  it('persists dismissal per (chatbot, model) pair under its own key', () => {
    markDeepSeekNoticeDismissed('bot-a', 'deepseek-r1:70b')
    expect(isDeepSeekNoticeDismissed('bot-a', 'deepseek-r1:70b')).toBe(true)
    expect(isDeepSeekNoticeDismissed('bot-b', 'deepseek-r1:70b')).toBe(false)
    expect(isCocBannerDismissed('bot-a', 'deepseek-r1:70b')).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(DEEPSEEK_KEY)!)).toEqual([
      'bot-a::deepseek-r1:70b',
    ])
  })

  it('returns false for missing ids', () => {
    expect(isDeepSeekNoticeDismissed(null, 'deepseek-r1:70b')).toBe(false)
    expect(isDeepSeekNoticeDismissed('bot-a', '')).toBe(false)
  })
})

describe('SSR-safe behavior (no window)', () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'window',
  )

  afterEach(() => {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    }
  })

  it('isChatbotCocAcknowledged returns false when window is undefined', () => {
    // @ts-expect-error - intentionally removing window for SSR simulation
    delete globalThis.window
    expect(isChatbotCocAcknowledged('bot-a')).toBe(false)
  })

  it('markChatbotCocAcknowledged is a no-op when window is undefined', () => {
    // @ts-expect-error - intentionally removing window for SSR simulation
    delete globalThis.window
    expect(() => markChatbotCocAcknowledged('bot-a')).not.toThrow()
  })

  it('isCocBannerDismissed returns false when window is undefined', () => {
    // @ts-expect-error - intentionally removing window for SSR simulation
    delete globalThis.window
    expect(isCocBannerDismissed('bot-a', 'qwen/qwen3-32b')).toBe(false)
  })

  it('markCocBannerDismissed is a no-op when window is undefined', () => {
    // @ts-expect-error - intentionally removing window for SSR simulation
    delete globalThis.window
    expect(() =>
      markCocBannerDismissed('bot-a', 'qwen/qwen3-32b'),
    ).not.toThrow()
  })
})
