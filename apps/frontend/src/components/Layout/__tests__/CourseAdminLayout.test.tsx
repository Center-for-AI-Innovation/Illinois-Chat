import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const hoisted = vi.hoisted(() => ({
  router: { isReady: true, query: { course_name: 'my-bot' } as any },
  auth: { isLoading: false, isAuthenticated: true } as any,
  role: { isPending: false, isError: false, data: 'owner', error: null } as any,
  roleArgs: vi.fn(),
}))

vi.mock('next/router', () => ({ useRouter: () => hoisted.router }))
vi.mock('react-oidc-context', () => ({ useAuth: () => hoisted.auth }))
vi.mock('~/hooks/queries/useFetchCourseRole', () => ({
  useFetchCourseRole: (args: unknown) => {
    hoisted.roleArgs(args)
    return hoisted.role
  },
}))
vi.mock('~/components/UIUC-Components/PermissionGate', () => ({
  PermissionGate: (p: { errorType?: number }) => (
    <div>permission-gate-{p.errorType ?? 'signin'}</div>
  ),
}))
vi.mock('~/components/UIUC-Components/CannotEditCourse', () => ({
  CannotEditCourse: () => <div>cannot-edit-course</div>,
}))
vi.mock('~/components/UIUC-Components/CourseIsFrozen', () => ({
  CourseIsFrozen: () => <div>course-is-frozen</div>,
}))
vi.mock('~/components/UIUC-Components/RoleCheckFailed', () => ({
  RoleCheckFailed: (p: { onRetry: () => void }) => (
    <button onClick={p.onRetry}>role-check-failed</button>
  ),
}))
vi.mock('~/components/UIUC-Components/CannotEditGPT4', () => ({
  CannotEditGPT4Page: () => <div>cannot-edit-gpt4</div>,
}))
vi.mock('~/components/UIUC-Components/MainPageBackground', () => ({
  LoadingPlaceholderForAdminPages: () => <div>loading</div>,
}))

import CourseAdminLayout from '../CourseAdminLayout'

const Child = vi.fn(() => <div>page-content</div>)
const renderLayout = () =>
  render(
    <CourseAdminLayout>
      <Child />
    </CourseAdminLayout>,
  )

describe('CourseAdminLayout', () => {
  beforeEach(() => {
    hoisted.router = { isReady: true, query: { course_name: 'my-bot' } }
    hoisted.auth = { isLoading: false, isAuthenticated: true }
    hoisted.role = {
      isPending: false,
      isError: false,
      data: 'owner',
      error: null,
    }
  })

  it('renders the page for an owner', () => {
    renderLayout()
    expect(screen.getByText('page-content')).toBeTruthy()
  })

  it('renders the page for an admin', () => {
    hoisted.role.data = 'admin'
    renderLayout()
    expect(screen.getByText('page-content')).toBeTruthy()
  })

  it('shows CannotEditCourse for a member without mounting the page', () => {
    hoisted.role.data = 'member'
    renderLayout()
    expect(screen.getByText('cannot-edit-course')).toBeTruthy()
    expect(Child).not.toHaveBeenCalled()
  })

  it('shows CourseIsFrozen on a 403', () => {
    hoisted.role = {
      isPending: false,
      isError: true,
      isLoadingError: true,
      data: undefined,
      error: { status: 403 },
    }
    renderLayout()
    expect(screen.getByText('course-is-frozen')).toBeTruthy()
  })

  it('shows the sign-in gate when signed out and does not fetch the role', () => {
    hoisted.auth = { isLoading: false, isAuthenticated: false }
    renderLayout()
    expect(screen.getByText('permission-gate-signin')).toBeTruthy()
    expect(hoisted.roleArgs).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  it('shows the 404 gate for a missing project', () => {
    hoisted.role = {
      isPending: false,
      isError: true,
      isLoadingError: true,
      data: undefined,
      error: { status: 404 },
    }
    renderLayout()
    expect(screen.getByText('permission-gate-404')).toBeTruthy()
  })

  it('shows the sign-in gate on a 401 from the role check', () => {
    hoisted.role = {
      isPending: false,
      isError: true,
      isLoadingError: true,
      data: undefined,
      error: { status: 401 },
    }
    renderLayout()
    expect(screen.getByText('permission-gate-signin')).toBeTruthy()
  })

  it('shows a retryable error when the role check fails with a 5xx', () => {
    const refetch = vi.fn()
    hoisted.role = {
      isPending: false,
      isError: true,
      isLoadingError: true,
      data: undefined,
      error: { status: 500 },
      refetch,
    }
    renderLayout()
    fireEvent.click(screen.getByText('role-check-failed'))
    expect(refetch).toHaveBeenCalled()
    expect(Child).not.toHaveBeenCalled()
  })

  it('keeps the page mounted when a background refetch fails', () => {
    hoisted.role = {
      isPending: false,
      isError: true,
      isLoadingError: false,
      isRefetchError: true,
      data: 'owner',
      error: { status: 500 },
    }
    renderLayout()
    expect(screen.getByText('page-content')).toBeTruthy()
  })

  it('shows CannotEditGPT4Page for no-context projects', () => {
    hoisted.router.query.course_name = 'gpt4'
    renderLayout()
    expect(screen.getByText('cannot-edit-gpt4')).toBeTruthy()
  })

  it('shows the loading placeholder while auth or the role is loading', () => {
    hoisted.auth.isLoading = true
    renderLayout()
    expect(screen.getByText('loading')).toBeTruthy()
  })

  it('shows the loading placeholder while the role is pending', () => {
    hoisted.role = {
      isPending: true,
      isError: false,
      data: undefined,
      error: null,
    }
    renderLayout()
    expect(screen.getByText('loading')).toBeTruthy()
  })
})
