import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useFetchCourseRole } from '~/hooks/queries/useFetchCourseRole'

const res = (status: number, body: unknown = {}) => ({
  ok: status < 400,
  status,
  statusText: String(status),
  json: async () => body,
})

function renderRoleHook(responses: Array<ReturnType<typeof res> | Error>) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift()!
    if (next instanceof Error) throw next
    return next
  })
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useFetchCourseRole({ courseName: 'my-bot' }), {
    wrapper,
  })
  return { ...hook, fetchMock }
}

describe('useFetchCourseRole retries', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retries a 5xx and then returns the role', async () => {
    const { result, fetchMock } = renderRoleHook([
      res(500),
      res(200, { role: 'owner' }),
    ])
    await waitFor(() => expect(result.current.data).toBe('owner'), {
      timeout: 3000,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a network error', async () => {
    const { result, fetchMock } = renderRoleHook([
      new TypeError('Failed to fetch'),
      res(200, { role: 'admin' }),
    ])
    await waitFor(() => expect(result.current.data).toBe('admin'), {
      timeout: 3000,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 4xx', async () => {
    const { result, fetchMock } = renderRoleHook([
      res(401),
      res(200, { role: 'owner' }),
    ])
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
