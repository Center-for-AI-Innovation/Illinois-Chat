import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'

import { createTestQueryClient } from '~/test-utils/renderWithProviders'
import {
  type AllLLMProviders,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import { showToast } from '~/utils/toastUtils'
import { useAIModelsSettings } from '../useAIModelsSettings'

vi.mock('~/utils/toastUtils', () => ({ showToast: vi.fn() }))

const PROJECT = 'CS101'
const KEY = ['projectLLMProviders', PROJECT]

function makeProviders(): AllLLMProviders {
  return {
    [ProviderNames.OpenAI]: {
      provider: ProviderNames.OpenAI,
      enabled: false,
      models: [{ id: 'gpt-a', name: 'A', enabled: true, default: true }],
    },
    [ProviderNames.Anthropic]: {
      provider: ProviderNames.Anthropic,
      enabled: true,
      models: [{ id: 'claude-a', name: 'C', enabled: true, default: false }],
    },
  } as unknown as AllLLMProviders
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type UpsertHandler = (body: AllLLMProviders) => Promise<Response> | Response

async function setup() {
  let serverState = makeProviders()
  const upserts: AllLLMProviders[] = []
  const handlers: UpsertHandler[] = []

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.includes('/api/models')) return json(serverState)
    if (url.includes('/api/UIUC-api/upsertLLMProviders')) {
      const { llmProviders } = JSON.parse(String(init?.body))
      upserts.push(llmProviders)
      const handler = handlers.shift()
      if (handler) return handler(llmProviders)
      serverState = llmProviders
      return json({ ok: true })
    }
    return json({})
  })

  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useAIModelsSettings(PROJECT), { wrapper })
  await waitFor(() => expect(hook.result.current.llmProviders).toBeDefined())

  return {
    hook,
    queryClient,
    upserts,
    handlers,
    getServerState: () => serverState,
    flushDebounce: () => act(() => vi.advanceTimersByTimeAsync(1000)),
  }
}

describe('useAIModelsSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(showToast).mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('updates the cache immediately, before the debounced request', async () => {
    const { hook, queryClient, upserts } = await setup()

    act(() => {
      void hook.result.current.toggleProvider(ProviderNames.OpenAI, true)
    })

    expect(
      queryClient.getQueryData<AllLLMProviders>(KEY)?.[ProviderNames.OpenAI]
        .enabled,
    ).toBe(true)
    expect(upserts).toHaveLength(0)
  })

  it('persists two rapid toggles on different cards in one request', async () => {
    const { hook, upserts, flushDebounce } = await setup()

    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => {
      first = hook.result.current.toggleProvider(ProviderNames.OpenAI, true)
      second = hook.result.current.toggleModel(
        ProviderNames.Anthropic,
        'claude-a',
        false,
      )
    })
    await flushDebounce()

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    expect(upserts).toHaveLength(1)
    expect(upserts[0]![ProviderNames.OpenAI].enabled).toBe(true)
    expect(upserts[0]![ProviderNames.Anthropic].models?.[0]?.enabled).toBe(
      false,
    )
    expect(showToast).toHaveBeenCalledTimes(2)
  })

  it('sends a toggle and a field save made within 1s together', async () => {
    const { hook, upserts, flushDebounce } = await setup()

    let save!: Promise<boolean>
    act(() => {
      void hook.result.current.toggleProvider(ProviderNames.OpenAI, true)
      save = hook.result.current.saveProviderFields(ProviderNames.OpenAI, {
        apiKey: 'sk-test',
      })
    })
    await flushDebounce()

    await expect(save).resolves.toBe(true)
    expect(upserts).toHaveLength(1)
    expect(upserts[0]![ProviderNames.OpenAI]).toMatchObject({
      enabled: true,
      apiKey: 'sk-test',
    })
  })

  it('keeps an earlier toggle when a stale refetch lands mid-debounce', async () => {
    const { hook, queryClient, upserts, flushDebounce } = await setup()

    act(() => {
      void hook.result.current.toggleProvider(ProviderNames.OpenAI, true)
    })
    // Simulate a window-focus / invalidation refetch returning old data.
    act(() => {
      queryClient.setQueryData(KEY, makeProviders())
    })
    act(() => {
      void hook.result.current.toggleModel(
        ProviderNames.Anthropic,
        'claude-a',
        false,
      )
    })
    await flushDebounce()

    expect(upserts).toHaveLength(1)
    expect(upserts[0]![ProviderNames.OpenAI].enabled).toBe(true)
    expect(upserts[0]![ProviderNames.Anthropic].models?.[0]?.enabled).toBe(
      false,
    )
  })

  it('reports a failed save and recovers the server state', async () => {
    const { hook, queryClient, handlers, getServerState, flushDebounce } =
      await setup()
    handlers.push(() => json({ error: 'boom' }, 500))

    let result!: Promise<boolean>
    act(() => {
      result = hook.result.current.toggleProvider(ProviderNames.OpenAI, true)
    })
    await flushDebounce()

    await expect(result).resolves.toBe(false)
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    )
    // onSettled invalidates; the refetch restores what the server has.
    await waitFor(() =>
      expect(queryClient.getQueryData(KEY)).toEqual(getServerState()),
    )
    expect(
      queryClient.getQueryData<AllLLMProviders>(KEY)?.[ProviderNames.OpenAI]
        .enabled,
    ).toBe(false)
  })

  it('re-sends a failed change when a later action was queued on top of it', async () => {
    const { hook, upserts, handlers, flushDebounce } = await setup()
    let failFirst!: () => void
    handlers.push(
      () =>
        new Promise<Response>((resolve) => {
          failFirst = () => resolve(json({ error: 'boom' }, 500))
        }),
    )

    let first!: Promise<boolean>
    act(() => {
      first = hook.result.current.toggleProvider(ProviderNames.OpenAI, true)
    })
    await flushDebounce() // batch 1 is now in flight

    let second!: Promise<boolean>
    act(() => {
      second = hook.result.current.toggleModel(
        ProviderNames.Anthropic,
        'claude-a',
        false,
      )
    })
    await act(async () => failFirst())
    await flushDebounce()

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(true)
    expect(upserts).toHaveLength(2)
    // Documented behaviour: batch 2 carries batch 1's change too.
    expect(upserts[1]![ProviderNames.OpenAI].enabled).toBe(true)
    expect(upserts[1]![ProviderNames.Anthropic].models?.[0]?.enabled).toBe(
      false,
    )
  })

  it('sets the default model on exactly one model', async () => {
    const { hook, upserts, flushDebounce } = await setup()

    act(() => {
      void hook.result.current.setDefaultModel({
        id: 'claude-a',
        provider: ProviderNames.Anthropic,
      })
    })
    await flushDebounce()

    expect(upserts[0]![ProviderNames.OpenAI].models?.[0]?.default).toBe(false)
    expect(upserts[0]![ProviderNames.Anthropic].models?.[0]?.default).toBe(true)
  })
})
