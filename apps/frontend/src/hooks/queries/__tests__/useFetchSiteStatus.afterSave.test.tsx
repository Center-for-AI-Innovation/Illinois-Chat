// Settings saves and the shared site-status query. The bare status URL is
// served by a shared cache (a CDN in front of the origin) that can answer with a
// copy from before a save. These tests play that cache and the origin, and check
// what the hook returns: the saved status right after a save, no late pre-save
// response replacing it, a failed refresh keeping the last good status, and
// ordinary polling on the bare URL afterwards.

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

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
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
let fetchSpy: MockInstance<typeof fetch>

beforeEach(() => {
  vi.useFakeTimers()
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
  await settle()
  return hook
}

async function save(
  mutateAsync: (settings: PlatformSettingsUpdate) => Promise<unknown>,
  settings: PlatformSettingsUpdate,
) {
  let result: unknown
  await act(async () => {
    result = await mutateAsync(settings)
  })
  await settle()
  return result
}

describe('settings save and the shared site status', () => {
  it('shows the saved status at once, while the bare URL still serves the pre-save copy', async () => {
    const { result } = await mountAndSettle()
    expect(result.current.status.data?.isMaintenanceMode).toBe(false)

    await save(result.current.save.mutateAsync, SAVE_ON)

    expect(result.current.status.data?.isMaintenanceMode).toBe(true)
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
    await act(async () => {
      void result.current.status.refetch()
    })
    expect(heldPolls).toHaveLength(1)

    await save(result.current.save.mutateAsync, SAVE_ON)
    expect(result.current.status.data?.isMaintenanceMode).toBe(true)
    // React Query aborted that poll when the save cancelled it.
    expect(heldPolls[0].signal?.aborted).toBe(true)

    // The old answer arrives after the save, still carrying the pre-save copy.
    holdPolls = false
    await act(async () => {
      heldPolls[0].resolve(json(PRE))
    })
    await settle()

    expect(result.current.status.data?.isMaintenanceMode).toBe(true)
  })

  it('a failed refresh keeps the last good status, and the save still resolves saved: true', async () => {
    refreshFails = true
    const { result } = await mountAndSettle()

    const saved = await save(result.current.save.mutateAsync, SAVE_ON)

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
    expect(refreshCalls()).toHaveLength(1)

    // By the next poll the shared cache holds a newer copy, which the poll shows.
    const withBanner: SiteStatus = { announcementBanner: BANNER, isMaintenanceMode: true }
    sharedCacheCopy = withBanner
    await settle(POLL_MS)

    expect(result.current.status.data).toEqual(withBanner)
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
    await settle()
    expect(heldRefreshes).toHaveLength(1)

    // A second save lands before the first refresh answers. It turns the
    // maintenance flag back off.
    holdRefreshes = false
    await save(result.current.save.mutateAsync, SAVE_OFF)
    expect(result.current.status.data?.isMaintenanceMode).toBe(false)

    // The first refresh answers late with the state it saw, which is now stale.
    await act(async () => {
      heldRefreshes[0].resolve(json(POST))
    })
    await settle()
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
