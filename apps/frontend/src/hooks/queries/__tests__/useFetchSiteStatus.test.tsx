import React from 'react'
import { act, renderHook } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  isMaintenanceBypassRoute,
  isStatusPollExempt,
  SITE_STATUS_QUERY_KEY,
  useFetchSiteStatus,
  type SiteStatus,
} from '../useFetchSiteStatus'

const POLL_MS = 60 * 1000

const BANNER = {
  enabled: true,
  message: 'Downtime Saturday 8pm.',
  linkText: '',
  linkUrl: '',
}

function statusResponse(status: SiteStatus, init: ResponseInit = {}) {
  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

/** Lets React Query's async fetch and state updates settle under fake timers. */
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Steps through time a second at a time until `done` holds, capped at two polls. */
async function advanceUntil(done: () => boolean, maxMs = 2 * POLL_MS) {
  for (let elapsed = 0; elapsed < maxMs && !done(); elapsed += 1000) {
    await settle(1000)
  }
}

let fetchSpy: MockInstance<typeof fetch>

beforeEach(() => {
  vi.useFakeTimers()
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      statusResponse({ announcementBanner: null, isMaintenanceMode: false }),
    )
})

afterEach(() => {
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useFetchSiteStatus', () => {
  it('makes one periodic request even when the gate and the banner both observe it', async () => {
    const queryClient = createClient()
    const Wrapper = createWrapper(queryClient)

    // Mirrors _app: the maintenance gate and the banner mount together.
    renderHook(() => useFetchSiteStatus(), { wrapper: Wrapper })
    renderHook(() => useFetchSiteStatus(), { wrapper: Wrapper })

    await settle()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/UIUC-api/siteStatus')

    await settle(POLL_MS)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    await settle(POLL_MS)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('refreshes when the window regains focus', async () => {
    const queryClient = createClient()
    renderHook(() => useFetchSiteStatus(), {
      wrapper: createWrapper(queryClient),
    })
    await settle()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Focus only refetches stale data, so age the status past its staleTime.
    await settle(31 * 1000)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    focusManager.setFocused(false)
    await act(async () => {
      focusManager.setFocused(true)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not fetch while disabled, which is how exempt pages opt out', async () => {
    const queryClient = createClient()
    renderHook(() => useFetchSiteStatus({ enabled: false }), {
      wrapper: createWrapper(queryClient),
    })

    await settle(POLL_MS * 3)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('bypasses maintenance on /admin and /silent-renew, and their subpaths only', () => {
    expect(isMaintenanceBypassRoute('/admin')).toBe(true)
    expect(isMaintenanceBypassRoute('/admin/platform')).toBe(true)
    expect(isMaintenanceBypassRoute('/silent-renew')).toBe(true)
    expect(isMaintenanceBypassRoute('/')).toBe(false)
    expect(isMaintenanceBypassRoute('/chatbots')).toBe(false)
  })

  it('makes no status request on silent-renew, but does poll on /admin', () => {
    expect(isStatusPollExempt('/silent-renew')).toBe(true)
    expect(isStatusPollExempt('/admin')).toBe(false)
    expect(isStatusPollExempt('/admin/platform')).toBe(false)
    expect(isStatusPollExempt('/chatbots')).toBe(false)
  })

  it('makes one request per interval on /admin: the gate is disabled, the banner polls', async () => {
    const queryClient = createClient()
    const Wrapper = createWrapper(queryClient)

    // Mirrors _app on /admin: the gate observer is bypassed, the banner's is
    // enabled, and both observe the one shared query.
    renderHook(() => useFetchSiteStatus({ enabled: false }), {
      wrapper: Wrapper,
    })
    renderHook(() => useFetchSiteStatus({ enabled: true }), {
      wrapper: Wrapper,
    })

    await settle()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await settle(POLL_MS)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    await settle(POLL_MS)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('makes no status request at all on silent-renew, however long it stays open', async () => {
    const queryClient = createClient()
    const Wrapper = createWrapper(queryClient)

    // On silent-renew both the gate and the banner are disabled.
    renderHook(() => useFetchSiteStatus({ enabled: false }), {
      wrapper: Wrapper,
    })
    renderHook(() => useFetchSiteStatus({ enabled: false }), {
      wrapper: Wrapper,
    })

    await settle(POLL_MS * 3)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps the last good status when a refresh fails, then recovers on the next poll', async () => {
    const queryClient = createClient()
    const good: SiteStatus = {
      announcementBanner: BANNER,
      isMaintenanceMode: true,
    }
    fetchSpy
      .mockResolvedValueOnce(statusResponse(good))
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(
        statusResponse({ announcementBanner: null, isMaintenanceMode: false }),
      )

    const { result } = renderHook(() => useFetchSiteStatus(), {
      wrapper: createWrapper(queryClient),
    })
    await settle()
    expect(result.current.data).toEqual(good)

    // The poll fails, and so does its one retry after backoff. The query only
    // reports an error once that retry has also failed, so wait well past it.
    // The last good value stays throughout.
    await advanceUntil(() => result.current.isError)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result.current.isError).toBe(true)
    expect(result.current.data).toEqual(good)

    await settle(POLL_MS)
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toEqual({
      announcementBanner: null,
      isMaintenanceMode: false,
    })
  })

  it('refetches a statically seeded entry on mount even when it is fresh', async () => {
    const queryClient = createClient()
    // What _app seeds from a home page: the banner, but no maintenance state.
    queryClient.setQueryData<SiteStatus>(
      SITE_STATUS_QUERY_KEY,
      { announcementBanner: BANNER },
      { updatedAt: Date.now() },
    )

    const { result } = renderHook(() => useFetchSiteStatus(), {
      wrapper: createWrapper(queryClient),
    })

    // Maintenance is unknown until this lands, so the gate must not wait for
    // the next poll to learn it.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.current.data?.announcementBanner).toEqual(BANNER)

    await settle()
    expect(result.current.data?.isMaintenanceMode).toBe(false)
  })

  it('does not refetch a fully known entry that is still fresh', async () => {
    const queryClient = createClient()
    queryClient.setQueryData<SiteStatus>(
      SITE_STATUS_QUERY_KEY,
      { announcementBanner: null, isMaintenanceMode: false },
      { updatedAt: Date.now() },
    )

    renderHook(() => useFetchSiteStatus(), {
      wrapper: createWrapper(queryClient),
    })

    await settle()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
