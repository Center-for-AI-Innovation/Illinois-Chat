// Settings saves and the shared site-status query. The bare status URL is
// served by a shared cache (a CDN in front of the origin) that can answer with a
// copy from before a save. These tests play that cache and the origin, and check
// what the hook returns: the saved status right after a save, no late pre-save
// response replacing it, a failed refresh keeping the last good status, and
// ordinary polling on the bare URL afterwards.
//
// Timing: only the poll interval and `Date` are faked, so the poll deadlines are
// exact, and network work runs on real time. `until` waits for a condition in
// real time without moving the fake clock.

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import type { PlatformSettingsUpdate } from '~/utils/platformSettings.schema'
import { useFetchSiteStatus, type SiteStatus } from '../useFetchSiteStatus'
import { useUpdatePlatformSettings } from '../useUpdatePlatformSettings'

const POLL_MS = 60 * 1000
const BARE_URL = '/api/UIUC-api/siteStatus'

const BANNER = {
  enabled: true,
  message: 'Downtime Saturday 8pm.',
  linkText: '',
  linkUrl: '',
}
const PRE: SiteStatus = { announcementBanner: null, isMaintenanceMode: false }
const POST: SiteStatus = { announcementBanner: null, isMaintenanceMode: true }
const WITH_BANNER: SiteStatus = { announcementBanner: BANNER, isMaintenanceMode: true }

const SAVE_ON = {
  version: '0',
  maintenance: { enabled: true, titleText: 'Down', bodyText: 'Back soon' },
} as unknown as PlatformSettingsUpdate
const SAVE_OFF = {
  version: '0',
  maintenance: { enabled: false, titleText: '', bodyText: '' },
} as unknown as PlatformSettingsUpdate

interface Pending {
  resolve: (response: Response) => void
  signal?: AbortSignal
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

/** Advances the fake poll clock by `ms`, and nothing else. */
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Lets real pending work (fetch bodies, React Query state) run for a moment. */
async function pause(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/**
 * Waits in real time until `condition` holds, without advancing the fake clock.
 * Used for background work, which finishes after the save resolves.
 */
async function until(condition: () => boolean, description: string) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await pause(5)
  }
  expect(condition(), description).toBe(true)
}

// What the shared cache and the origin are doing.
let origin: SiteStatus
let sharedCacheCopy: SiteStatus
let holdPolls: boolean
let heldPolls: Pending[]
let holdRefreshes: boolean
let heldRefreshes: Pending[]
let saveFails: boolean
let refreshFails: boolean
let refreshNetworkError: boolean
let fetchSpy: MockInstance<typeof fetch>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  // Deliver observer updates synchronously, so each assertion reads the value
  // the hook returns after the step that caused it.
  notifyManager.setScheduler((callback) => callback())
  origin = PRE
  sharedCacheCopy = PRE
  holdPolls = false
  heldPolls = []
  holdRefreshes = false
  heldRefreshes = []
  saveFails = false
  refreshFails = false
  refreshNetworkError = false
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = String(input)
      const signal = init?.signal ?? undefined

      if (url.startsWith('/api/admin/settings')) {
        if (saveFails) return json({ error: 'Could not write' }, 503)
        const body = JSON.parse(String(init?.body)) as PlatformSettingsUpdate
        origin = {
          announcementBanner: null,
          isMaintenanceMode: body.maintenance?.enabled === true,
        }
        return json({
          saved: true,
          revalidated: true,
          updatedAt: '2026-09-24T00:00:00.000Z',
          updatedBy: 'admin@illinois.edu',
          version: '1',
        })
      }

      if (url.includes('fresh=')) {
        if (refreshNetworkError) throw new TypeError('network down')
        if (refreshFails) return json({ error: 'down' }, 503)
        if (holdRefreshes) {
          return new Promise<Response>((resolve) =>
            heldRefreshes.push({ resolve, signal }),
          )
        }
        return json(origin)
      }

      // The bare URL goes through the shared cache, or is held so its
      // response can land late. The network does not honour the abort here, so
      // a late answer really arrives after the query has moved on.
      if (holdPolls) {
        return new Promise<Response>((resolve) =>
          heldPolls.push({ resolve, signal }),
        )
      }
      return json(sharedCacheCopy)
    })
})

afterEach(() => {
  notifyManager.setScheduler((callback) => setTimeout(callback, 0))
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function bareUrlCalls() {
  return fetchSpy.mock.calls.filter(([input]) => String(input) === BARE_URL)
}

function refreshCalls() {
  return fetchSpy.mock.calls.filter(([input]) => String(input).includes('fresh='))
}

async function mountAndSettle() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const hook = renderHook(
    () => ({
      status: useFetchSiteStatus(),
      save: useUpdatePlatformSettings(),
    }),
    { wrapper: createWrapper(queryClient) },
  )
  // Read the data the way a rendered component does. React Query notifies an
  // observer only about the props it has read, so an update that arrives later
  // (the save's refresh) would otherwise not re-render this hook.
  await settle()
  expect(hook.result.current.status.data).toEqual(PRE)
  return { ...hook, queryClient }
}

async function save(
  mutateAsync: (settings: PlatformSettingsUpdate) => Promise<unknown>,
  settings: PlatformSettingsUpdate,
) {
  let result: unknown
  await act(async () => {
    result = await mutateAsync(settings)
  })
  return result
}

describe('settings save and the shared site status', () => {
  it('a save just before a scheduled poll does not let that poll replace the saved status', async () => {
    // The mount poll runs at t=0, so the interval's next poll is due at t=60s.
    const { result } = await mountAndSettle()

    // Save at t=59s. The refresh succeeds, and the shared cache still holds the
    // pre-save copy for the bare URL.
    await settle(59 * 1000)
    await save(result.current.save.mutateAsync, SAVE_ON)
    await until(
      () => result.current.status.data?.isMaintenanceMode === true,
      'the refresh shows the saved status',
    )

    // Through the old t=60s deadline and the 5s shared-cache window (t=65s), no
    // bare-URL poll is sent, so the pre-save copy never reaches the UI.
    await settle(6 * 1000)
    expect(bareUrlCalls()).toHaveLength(1)
    expect(result.current.status.data?.isMaintenanceMode).toBe(true)

    // The CDN copy has expired and now carries a newer status, with a banner.
    sharedCacheCopy = WITH_BANNER
    await settle(53 * 1000 + 999)
    expect(bareUrlCalls()).toHaveLength(1)

    // The next poll runs at t=119s, a full minute after the successful refresh.
    await settle(1)
    expect(bareUrlCalls()).toHaveLength(2)
    await until(
      () => result.current.status.data?.announcementBanner !== null,
      'the t=119s poll shows the newer status',
    )
    expect(result.current.status.data).toEqual(WITH_BANNER)
  })

  it('a hung refresh does not hold the save open, and the status updates when it finally answers', async () => {
    const { result } = await mountAndSettle()

    holdRefreshes = true
    const saved = await save(result.current.save.mutateAsync, SAVE_ON)

    // The save resolves while the refresh is still unanswered.
    expect(saved).toMatchObject({ saved: true })
    expect(result.current.save.isPending).toBe(false)
    await until(() => heldRefreshes.length === 1, 'the refresh is in flight')
    // Until the refresh answers, the last good status is what the UI shows.
    expect(result.current.status.data).toEqual(PRE)

    heldRefreshes[0].resolve(json(POST))
    await until(
      () => result.current.status.data?.isMaintenanceMode === true,
      'the late refresh answer updates the status',
    )
  })

  it('a network error on the refresh is handled inside the save, with the last good status kept', async () => {
    refreshNetworkError = true
    const { result } = await mountAndSettle()

    const saved = await save(result.current.save.mutateAsync, SAVE_ON)
    await until(
      () => vi.mocked(console.warn).mock.calls.length > 0,
      'the failure is reported',
    )

    expect(saved).toMatchObject({ saved: true })
    expect(result.current.save.isError).toBe(false)
    expect(result.current.status.data).toEqual(PRE)
    expect(console.warn).toHaveBeenCalledWith(
      '[siteStatus] refresh after settings save failed',
    )
  })

  it('shows the saved status at once, while the bare URL still serves the pre-save copy', async () => {
    const { result } = await mountAndSettle()

    await save(result.current.save.mutateAsync, SAVE_ON)
    await until(
      () => result.current.status.data?.isMaintenanceMode === true,
      'the refresh shows the saved status',
    )

    // The refresh went to its own URL, not to the shared-cache copy.
    expect(refreshCalls()).toHaveLength(1)
    expect(refreshCalls()[0][1]).toEqual(
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('cancels an ordinary poll that began before the save, so its late response cannot replace the saved status', async () => {
    const { result } = await mountAndSettle()

    // A poll starts on the bare URL, and its response is still in the network.
    holdPolls = true
    void result.current.status.refetch()
    await until(() => heldPolls.length === 1, 'the poll is in flight')

    await save(result.current.save.mutateAsync, SAVE_ON)
    await until(
      () => result.current.status.data?.isMaintenanceMode === true,
      'the refresh shows the saved status',
    )
    // React Query aborted that poll when the save cancelled it.
    expect(heldPolls[0].signal?.aborted).toBe(true)

    // The old answer arrives after the save, still carrying the pre-save copy.
    holdPolls = false
    heldPolls[0].resolve(json(PRE))
    await pause(20)

    expect(result.current.status.data?.isMaintenanceMode).toBe(true)
  })

  it('a failed refresh keeps the last good status, and the save still resolves saved: true', async () => {
    refreshFails = true
    const { result } = await mountAndSettle()

    const saved = await save(result.current.save.mutateAsync, SAVE_ON)
    await until(
      () => vi.mocked(console.warn).mock.calls.length > 0,
      'the failure is reported',
    )

    expect(saved).toMatchObject({ saved: true })
    expect(result.current.save.isError).toBe(false)
    expect(result.current.status.data).toEqual(PRE)
    expect(console.warn).toHaveBeenCalledWith(
      '[siteStatus] refresh after settings save failed',
    )
  })

  it('after a save, the next scheduled poll reads the bare URL again', async () => {
    const { result } = await mountAndSettle()
    await save(result.current.save.mutateAsync, SAVE_ON)
    await until(
      () => result.current.status.data?.isMaintenanceMode === true,
      'the refresh shows the saved status',
    )
    expect(refreshCalls()).toHaveLength(1)

    // By the next poll the shared cache holds a newer copy, which the poll shows.
    sharedCacheCopy = WITH_BANNER
    await settle(POLL_MS)

    await until(
      () => result.current.status.data?.announcementBanner !== null,
      'the poll shows the shared-cache copy',
    )
    expect(result.current.status.data).toEqual(WITH_BANNER)
    const polls = bareUrlCalls()
    expect(polls.at(-1)?.[0]).toBe(BARE_URL)
    expect(polls.at(-1)?.[1]?.cache).toBeUndefined()
    // No further explicit refresh was made by the poll.
    expect(refreshCalls()).toHaveLength(1)
  })

  it('with overlapping saves, the latest refresh wins and an earlier refresh that lands late is ignored', async () => {
    const { result } = await mountAndSettle()

    // The first save's refresh is held in the network.
    holdRefreshes = true
    const firstSave = result.current.save.mutateAsync(SAVE_ON)
    await until(() => heldRefreshes.length === 1, 'the first refresh is in flight')

    // A second save lands before the first refresh answers. It turns the
    // maintenance flag back off.
    holdRefreshes = false
    await save(result.current.save.mutateAsync, SAVE_OFF)
    await until(
      () => result.current.status.data?.isMaintenanceMode === false,
      'the second refresh shows the latest status',
    )

    // The first refresh answers late with the state it saw, which is now stale.
    heldRefreshes[0].resolve(json(POST))
    await pause(20)
    expect(result.current.status.data?.isMaintenanceMode).toBe(false)

    // The first save is still durable and still resolves.
    await expect(firstSave).resolves.toMatchObject({ saved: true })
  })

  it('a rejected save does not refresh the status and still reports the failure', async () => {
    saveFails = true
    const { result } = await mountAndSettle()

    let error: unknown
    await act(async () => {
      try {
        await result.current.save.mutateAsync(SAVE_ON)
      } catch (caught) {
        error = caught
      }
    })

    expect(error).toBeInstanceOf(Error)
    expect(refreshCalls()).toHaveLength(0)
    expect(result.current.status.data).toEqual(PRE)
  })
})
