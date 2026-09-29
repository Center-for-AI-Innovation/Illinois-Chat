import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchIsSuperAdmin,
  useFetchIsSuperAdmin,
} from '../useFetchIsSuperAdmin'
import {
  fetchPlatformSettings,
  PLATFORM_SETTINGS_QUERY_KEY,
  useFetchPlatformSettings,
} from '../useFetchPlatformSettings'
import {
  fetchConnectionCandidates,
  fetchProjectConnection,
  fetchProjectConnections,
  useFetchConnectionCandidates,
  useFetchProjectConnection,
  useFetchProjectConnections,
} from '../useFetchProjectConnections'
import { fetchSuperAdmins, useFetchSuperAdmins } from '../useFetchSuperAdmins'
import {
  testProjectConnection,
  useTestProjectConnection,
} from '../useTestProjectConnection'
import {
  updatePlatformSettings,
  useUpdatePlatformSettings,
} from '../useUpdatePlatformSettings'
import {
  updateProjectConnection,
  useUpdateProjectConnection,
} from '../useUpdateProjectConnection'
import {
  updateSuperAdmins,
  useUpdateSuperAdmins,
} from '../useUpdateSuperAdmins'
import type { PlatformSettings } from '~/utils/platformSettings.schema'

const settings: PlatformSettings = {
  announcementBanner: {
    enabled: false,
    message: '',
    linkText: '',
    linkUrl: '',
  },
  maintenance: { enabled: false, titleText: '', bodyText: '' },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function createClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
  return { queryClient, Wrapper }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('super admin queries', () => {
  it('treats 401 and 403 as not a super admin', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'Missing token' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, 403))

    await expect(fetchIsSuperAdmin()).resolves.toBe(false)
    await expect(fetchIsSuperAdmin()).resolves.toBe(false)
  })

  it('returns the boolean the server actually sent', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ email: 'a@illinois.edu', isSuperAdmin: true }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ email: 'a@illinois.edu', isSuperAdmin: false }),
      )

    await expect(fetchIsSuperAdmin()).resolves.toBe(true)
    await expect(fetchIsSuperAdmin()).resolves.toBe(false)
  })

  it('throws on any other failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 500 }),
    )
    await expect(fetchIsSuperAdmin()).rejects.toThrow(
      'Error fetching super-admin status: 500',
    )
  })

  it('does not ask when the query is disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { Wrapper } = createClient()
    renderHook(() => useFetchIsSuperAdmin({ enabled: false }), {
      wrapper: Wrapper,
    })
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the roster', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ envAdmins: ['env@illinois.edu'], grantedAdmins: [] }),
    )
    await expect(fetchSuperAdmins()).resolves.toEqual({
      envAdmins: ['env@illinois.edu'],
      grantedAdmins: [],
    })
  })

  it('surfaces the server message, and a status fallback when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'Redis down' }, 503))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))

    await expect(fetchSuperAdmins()).rejects.toThrow('Redis down')
    await expect(fetchSuperAdmins()).rejects.toThrow(
      'Error fetching super admins: 500',
    )
  })

  it('does not load the roster when disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { Wrapper } = createClient()
    renderHook(() => useFetchSuperAdmins({ enabled: false }), {
      wrapper: Wrapper,
    })
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('adds and removes, then writes the returned roster into the cache', async () => {
    const roster = {
      envAdmins: ['env@illinois.edu'],
      grantedAdmins: ['new@illinois.edu'],
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(roster))
      .mockResolvedValueOnce(jsonResponse({ ...roster, grantedAdmins: [] }))

    await expect(
      updateSuperAdmins({ action: 'add', email: 'New@illinois.edu' }),
    ).resolves.toEqual(roster)
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/superAdmins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'New@illinois.edu' }),
    })

    await updateSuperAdmins({ action: 'remove', email: 'new@illinois.edu' })
    expect(fetchSpy).toHaveBeenLastCalledWith(
      '/api/admin/superAdmins?email=new%40illinois.edu',
      { method: 'DELETE' },
    )

    const { queryClient, Wrapper } = createClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fetchSpy.mockResolvedValueOnce(jsonResponse(roster))
    const { result } = renderHook(() => useUpdateSuperAdmins(), {
      wrapper: Wrapper,
    })
    await result.current.mutateAsync({
      action: 'add',
      email: 'new@illinois.edu',
    })

    expect(queryClient.getQueryData(['superAdminRoster'])).toEqual(roster)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['isSuperAdmin'] })
  })

  it('keeps the server refusal, and names the action when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Cannot remove the last super admin' }, 400),
      )
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))

    await expect(
      updateSuperAdmins({ action: 'remove', email: 'a@illinois.edu' }),
    ).rejects.toThrow('Cannot remove the last super admin')
    await expect(
      updateSuperAdmins({ action: 'add', email: 'a@illinois.edu' }),
    ).rejects.toThrow('Failed to add super admin (500)')
  })
})

describe('platform settings queries', () => {
  it('returns the snapshot', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ settings, bannerState: 'absent' }),
    )
    await expect(fetchPlatformSettings()).resolves.toMatchObject({
      bannerState: 'absent',
    })
  })

  it('surfaces the server message, and a status fallback when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, 403))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))

    await expect(fetchPlatformSettings()).rejects.toThrow('Forbidden')
    await expect(fetchPlatformSettings()).rejects.toThrow(
      'Error fetching platform settings: 500',
    )
  })

  it('does not load settings when disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { Wrapper } = createClient()
    renderHook(() => useFetchPlatformSettings({ enabled: false }), {
      wrapper: Wrapper,
    })
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('saves, then drops the settings and maintenance caches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        saved: true,
        revalidated: true,
        updatedAt: '2026-09-24T00:00:00.000Z',
        updatedBy: 'admin@illinois.edu',
      }),
    )
    await expect(updatePlatformSettings(settings)).resolves.toMatchObject({
      saved: true,
    })
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })

    const { queryClient, Wrapper } = createClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        saved: true,
        revalidated: false,
        updatedAt: '2026-09-24T00:00:00.000Z',
        updatedBy: 'admin@illinois.edu',
      }),
    )
    const { result } = renderHook(() => useUpdatePlatformSettings(), {
      wrapper: Wrapper,
    })
    await result.current.mutateAsync(settings)

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: PLATFORM_SETTINGS_QUERY_KEY,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['maintenanceMode'] })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['maintenanceDetails'],
    })
  })

  it('surfaces a save failure, including when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Message is required' }, 400),
      )
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))

    await expect(updatePlatformSettings(settings)).rejects.toThrow(
      'Message is required',
    )
    await expect(updatePlatformSettings(settings)).rejects.toThrow(
      'Failed to save settings (503)',
    )
  })
})

describe('project connection queries', () => {
  it('lists connections and reads one project', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ connections: [{ project_name: 'chat' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ found: true, project_name: 'chat' }),
      )

    await expect(fetchProjectConnections()).resolves.toEqual([
      { project_name: 'chat' },
    ])
    await expect(fetchProjectConnection('Chat Bot')).resolves.toMatchObject({
      found: true,
    })
    expect(fetchSpy).toHaveBeenLastCalledWith(
      '/api/UIUC-api/projectConnections?project_name=Chat%20Bot',
    )
  })

  it('searches candidates and keeps the previous page while the next search loads', async () => {
    let resolveNext: (response: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      resolveNext = resolve
    })
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ projects: ['chat'], limit: 20 }))
      .mockResolvedValueOnce(jsonResponse({ projects: ['chat'], limit: 20 }))
      .mockImplementationOnce(() => pending)

    await expect(fetchConnectionCandidates('ch')).resolves.toEqual({
      projects: ['chat'],
      limit: 20,
    })

    const { Wrapper } = createClient()
    const { result, rerender } = renderHook(
      ({ query }) => useFetchConnectionCandidates(query),
      { wrapper: Wrapper, initialProps: { query: 'c' } },
    )
    await waitFor(() => expect(result.current.data?.projects).toEqual(['chat']))

    rerender({ query: 'ch' })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    expect(result.current.data?.projects).toEqual(['chat'])

    resolveNext(jsonResponse({ projects: ['chatbots'], limit: 20 }))
    await waitFor(() =>
      expect(result.current.data?.projects).toEqual(['chatbots']),
    )
  })

  it('surfaces search and read failures, including a non-JSON body', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'Too long' }, 400))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response('nope', { status: 502 }))

    await expect(fetchConnectionCandidates('q')).rejects.toThrow('Too long')
    await expect(fetchProjectConnections()).rejects.toThrow(
      'Error fetching connections: 500',
    )
    await expect(fetchProjectConnection('chat')).rejects.toThrow(
      'Error fetching connection: 502',
    )
  })

  it('does not fetch a list, a project, or candidates when disabled or unnamed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { Wrapper } = createClient()

    renderHook(() => useFetchProjectConnections({ enabled: false }), {
      wrapper: Wrapper,
    })
    renderHook(() => useFetchProjectConnection(null), { wrapper: Wrapper })
    renderHook(() => useFetchConnectionCandidates('c', { enabled: false }), {
      wrapper: Wrapper,
    })

    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('upserts, patches, toggles, and clears, then invalidates the three caches', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true }))

    await updateProjectConnection({
      action: 'upsert',
      projectName: 'chat',
      kind: 's3',
      config: { region: 'us-east-1' },
    })
    await updateProjectConnection({
      action: 'patch',
      projectName: 'chat',
      kind: 'database',
      config: {},
    })
    await updateProjectConnection({
      action: 'setActive',
      projectName: 'chat',
      isActive: false,
    })
    await updateProjectConnection({ action: 'clear', projectName: 'chat' })
    await updateProjectConnection({
      action: 'clear',
      projectName: 'chat',
      kind: 'qdrant',
    })

    const urls = fetchSpy.mock.calls.map(([url, init]) => [
      url,
      (init as RequestInit | undefined)?.method,
    ])
    expect(urls).toEqual([
      ['/api/UIUC-api/projectConnections', 'POST'],
      ['/api/UIUC-api/projectConnections', 'PATCH'],
      ['/api/UIUC-api/projectConnections/active', 'PATCH'],
      ['/api/UIUC-api/projectConnections?project_name=chat', 'DELETE'],
      [
        '/api/UIUC-api/projectConnections?project_name=chat&kind=qdrant',
        'DELETE',
      ],
    ])

    const { queryClient, Wrapper } = createClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateProjectConnection(), {
      wrapper: Wrapper,
    })
    await result.current.mutateAsync({
      action: 'setActive',
      projectName: 'chat',
      isActive: true,
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['projectConnection', 'chat'],
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['projectConnections'],
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['projectConnectionCandidates'],
    })
  })

  it('throws the server message, a status fallback, and on an unknown action', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'Unknown project' }, 404))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))

    await expect(
      updateProjectConnection({
        action: 'upsert',
        projectName: 'missing',
        kind: 's3',
        config: {},
      }),
    ).rejects.toThrow('Unknown project')
    await expect(
      updateProjectConnection({
        action: 'patch',
        projectName: 'chat',
        kind: 's3',
        config: {},
      }),
    ).rejects.toThrow('Request failed (500)')
    await expect(
      updateProjectConnection({ action: 'nope' } as never),
    ).rejects.toThrow('Unhandled action')
  })

  it('returns a failed probe as data, and throws when the request itself fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ ok: false, code: 'auth', message: 'bad key' }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'Not configured' }, 404))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))

    await expect(
      testProjectConnection({ projectName: 'chat', kind: 's3' }),
    ).resolves.toEqual({ ok: false, code: 'auth', message: 'bad key' })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/UIUC-api/projectConnections/test',
      expect.objectContaining({ method: 'POST' }),
    )
    await expect(
      testProjectConnection({ projectName: 'chat', kind: 's3' }),
    ).rejects.toThrow('Not configured')
    await expect(
      testProjectConnection({ projectName: 'chat', kind: 'database' }),
    ).rejects.toThrow('Test failed (500)')

    const { Wrapper } = createClient()
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const { result } = renderHook(() => useTestProjectConnection(), {
      wrapper: Wrapper,
    })
    await result.current.mutateAsync({ projectName: 'chat', kind: 'embedding' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ ok: true })
  })
})
