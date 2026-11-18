import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FROZEN_PROJECTS_QUERY_KEY } from '../useFetchFrozenProjects'
import {
  FrozenProjectRecoveryPartialError,
  recoverFrozenProject,
  useRecoverFrozenProject,
} from '../useRecoverFrozenProject'

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status })
}

function mockFetchOnce(body: unknown, status: number) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(jsonResponse(body, status))
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => {
      throw new Error('expected the recovery to reject')
    },
    (err: unknown) => err,
  )
  return error as Error
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recoverFrozenProject', () => {
  it('resolves with the server body when the unfreeze succeeds', async () => {
    mockFetchOnce({ recovered: true, course_name: 'Alpha' }, 200)

    await expect(recoverFrozenProject('Alpha')).resolves.toEqual({
      recovered: true,
      course_name: 'Alpha',
    })
  })

  it('reports a 500 that says recovered=true as a partial success, keeping the server message', async () => {
    mockFetchOnce(
      {
        recovered: true,
        error:
          'The project was unfrozen, but its audit entry could not be finalized.',
      },
      500,
    )

    const error = await rejectionOf(recoverFrozenProject('Alpha'))
    expect(error).toBeInstanceOf(FrozenProjectRecoveryPartialError)
    expect(error.message).toBe(
      'The project was unfrozen, but its audit entry could not be finalized.',
    )
  })

  it('does not treat an arbitrary 500 as recovered', async () => {
    mockFetchOnce({ error: 'Internal server error' }, 500)

    const error = await rejectionOf(recoverFrozenProject('Alpha'))
    expect(error).not.toBeInstanceOf(FrozenProjectRecoveryPartialError)
    expect(error.message).toBe('Internal server error')
  })

  it('does not treat a non-500 that carries recovered=true as partial', async () => {
    mockFetchOnce({ recovered: true, error: 'Project is not frozen.' }, 409)

    const error = await rejectionOf(recoverFrozenProject('Alpha'))
    expect(error).not.toBeInstanceOf(FrozenProjectRecoveryPartialError)
    expect(error.message).toBe('Project is not frozen.')
  })
})

describe('useRecoverFrozenProject', () => {
  function renderMutation() {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    }
    const { result } = renderHook(() => useRecoverFrozenProject(), {
      wrapper: Wrapper,
    })
    return { result, invalidate }
  }

  it('still refreshes the frozen list after a partial outcome', async () => {
    mockFetchOnce({ recovered: true, error: 'audit needs attention' }, 500)
    const { result, invalidate } = renderMutation()

    await expect(result.current.mutateAsync('Alpha')).rejects.toBeInstanceOf(
      FrozenProjectRecoveryPartialError,
    )
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: FROZEN_PROJECTS_QUERY_KEY,
    })
  })

  it('refreshes the frozen list after an ordinary failure too', async () => {
    mockFetchOnce({ error: 'Redis unreachable' }, 503)
    const { result, invalidate } = renderMutation()

    await expect(result.current.mutateAsync('Alpha')).rejects.toThrow(
      'Redis unreachable',
    )
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: FROZEN_PROJECTS_QUERY_KEY,
    })
  })
})
