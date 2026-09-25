import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  fetchContextsByVectorEngine: vi.fn(),
}))

vi.mock('~/utils/fetchContexts', () => ({
  fetchContextsByVectorEngine: hoisted.fetchContextsByVectorEngine,
}))

import { fetchContextsServer } from '../agentServerUtils'

const params = { courseName: 'CS101', searchQuery: 'loop invariant' }

// Runs the helper while draining its backoff sleeps under fake timers
const run = async (
  overrides: Partial<Parameters<typeof fetchContextsServer>[0]> = {},
) => {
  const pending = fetchContextsServer({ ...params, ...overrides })
  // Attach a noop handler so a rejection is not reported as unhandled while
  // the timers are being drained
  pending.catch(() => undefined)
  await vi.runAllTimersAsync()
  return pending
}

describe('fetchContextsServer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    hoisted.fetchContextsByVectorEngine.mockReset()
  })

  it('returns the contexts on success', async () => {
    const contexts = [{ text: 'a' }, { text: 'b' }]
    hoisted.fetchContextsByVectorEngine.mockResolvedValue(contexts)

    await expect(run()).resolves.toEqual(contexts)
    expect(hoisted.fetchContextsByVectorEngine).toHaveBeenCalledTimes(1)
  })

  it('returns [] for a legitimately empty result without retrying', async () => {
    hoisted.fetchContextsByVectorEngine.mockResolvedValue([])

    await expect(run()).resolves.toEqual([])
    expect(hoisted.fetchContextsByVectorEngine).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures and returns the eventual result', async () => {
    hoisted.fetchContextsByVectorEngine
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce([{ text: 'recovered' }])

    await expect(run()).resolves.toEqual([{ text: 'recovered' }])
    expect(hoisted.fetchContextsByVectorEngine).toHaveBeenCalledTimes(2)
  })

  it('throws the last error once every attempt has failed', async () => {
    hoisted.fetchContextsByVectorEngine.mockRejectedValue(
      new Error('backend down'),
    )

    await expect(run()).rejects.toThrow('backend down')
    expect(hoisted.fetchContextsByVectorEngine).toHaveBeenCalledTimes(4)
  })

  it('throws when the backend keeps returning a non-array payload', async () => {
    hoisted.fetchContextsByVectorEngine.mockResolvedValue({ error: 'nope' })

    await expect(run()).rejects.toThrow('Expected array, got object')
    expect(hoisted.fetchContextsByVectorEngine).toHaveBeenCalledTimes(4)
  })

  it('resolves to [] instead of throwing when aborted', async () => {
    const controller = new AbortController()
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    hoisted.fetchContextsByVectorEngine.mockImplementation(async () => {
      controller.abort()
      throw abortError
    })

    await expect(run({ signal: controller.signal })).resolves.toEqual([])
    expect(hoisted.fetchContextsByVectorEngine).toHaveBeenCalledTimes(1)
  })
})
