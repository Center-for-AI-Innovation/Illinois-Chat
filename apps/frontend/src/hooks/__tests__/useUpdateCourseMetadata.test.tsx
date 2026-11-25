import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'

import { createTestQueryClient } from '~/test-utils/renderWithProviders'
import type { CourseMetadata } from '~/types/courseMetadata'

const mockCallSetCourseMetadata = vi.fn()
vi.mock('~/utils/apiUtils', () => ({
  callSetCourseMetadata: (...args: unknown[]) =>
    mockCallSetCourseMetadata(...args),
  fetchCourseMetadata: vi.fn(),
  getBaseUrl: () => '',
}))

import { useUpdateCourseMetadata } from '../queries/useUpdateCourseMetadata'

const key = ['courseMetadata', 'CS101']

function setup(initial: Partial<CourseMetadata>) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(key, initial)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useUpdateCourseMetadata('CS101'), {
    wrapper,
  })
  return { queryClient, result }
}

describe('useUpdateCourseMetadata', () => {
  beforeEach(() => {
    mockCallSetCourseMetadata.mockReset()
  })

  it('sends only the given fields and merges them into the cache', async () => {
    mockCallSetCourseMetadata.mockResolvedValue(true)
    const { queryClient, result } = setup({
      course_intro_message: 'old',
      course_admins: ['a@x.com'],
    })

    let ok = false
    await act(async () => {
      ok = await result.current.save({ course_intro_message: 'new' })
    })

    expect(ok).toBe(true)
    expect(mockCallSetCourseMetadata).toHaveBeenCalledWith('CS101', {
      course_intro_message: 'new',
    })
    expect(queryClient.getQueryData(key)).toEqual({
      course_intro_message: 'new',
      course_admins: ['a@x.com'],
    })
  })

  it('on failure restores only the fields it changed', async () => {
    let rejectSave: (ok: boolean) => void = () => {}
    mockCallSetCourseMetadata.mockImplementation(
      () => new Promise<boolean>((resolve) => (rejectSave = resolve)),
    )
    const { queryClient, result } = setup({
      is_private: true,
      course_admins: ['a@x.com'],
    })

    let pending: Promise<boolean> = Promise.resolve(true)
    await act(async () => {
      pending = result.current.save({ is_private: false })
    })
    // Shown right away.
    expect(queryClient.getQueryData<CourseMetadata>(key)?.is_private).toBe(
      false,
    )

    // Another save lands in the cache meanwhile.
    queryClient.setQueryData<CourseMetadata>(key, (prev) =>
      prev ? { ...prev, course_admins: [] } : prev,
    )

    let ok = true
    await act(async () => {
      rejectSave(false)
      ok = await pending
    })

    expect(ok).toBe(false)
    // is_private is rolled back; the other change is kept.
    expect(queryClient.getQueryData(key)).toEqual({
      is_private: true,
      course_admins: [],
    })
  })
})
