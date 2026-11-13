import React, { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query'

const metadata = { course_owner: 'owner@example.com', course_admins: [] }

vi.mock('next/router', () => ({
  useRouter: () => ({ isReady: true, query: { course_name: 'my-bot' } }),
}))
vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ user: { profile: { email: 'owner@example.com' } } }),
}))
vi.mock('~/utils/apiUtils', () => ({
  getBaseUrl: () => '',
  fetchCourseMetadata: vi.fn(async () => metadata),
}))
vi.mock('~/components/UIUC-Components/PermissionGate', () => ({
  PermissionGate: () => <div>permission-gate</div>,
}))
vi.mock('~/components/UIUC-Components/MainPageBackground', () => ({
  LoadingPlaceholderForAdminPages: () => <div>loading</div>,
}))
// Mirrors UploadCard, which seeds ['courseMetadata', name] with raw metadata on mount
vi.mock('~/components/UIUC-Components/ProjectDashboard', () => ({
  default: ({ course_name }: { course_name: string }) => {
    const queryClient = useQueryClient()
    useEffect(() => {
      queryClient.setQueryData(['courseMetadata', course_name], metadata)
    }, [course_name, queryClient])
    return <div>dashboard-content</div>
  },
}))

import DashboardPage from '../dashboard'

describe('DashboardPage', () => {
  it('stays on the dashboard after its children write raw metadata to the shared cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ course_metadata: metadata }),
      })),
    )
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('dashboard-content')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('permission-gate')).toBeNull()
    expect(screen.getByText('dashboard-content')).toBeTruthy()
  })
})
