import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeProvider } from '~/contexts/ThemeContext'
import { AdminLayout } from '../AdminLayout'

const metadataState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}))

vi.mock('~/hooks/queries/useFetchCourseMetadata', () => ({
  useFetchCourseMetadata: () => metadataState.value,
}))

vi.mock('~/components/UIUC-Components/navbars/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}))

const superAdminState = vi.hoisted(() => ({
  value: { data: false, isLoading: false } as Record<string, unknown>,
}))
vi.mock('~/hooks/queries/useFetchIsSuperAdmin', () => ({
  useFetchIsSuperAdmin: () => superAdminState.value,
}))

const OWNER = 'owner@example.com'
const ADMIN = 'admin@example.com'

function signInAs(email: string) {
  globalThis.__TEST_AUTH__ = {
    isAuthenticated: true,
    user: { profile: { email } },
  }
}

describe('AdminLayout', () => {
  beforeEach(() => {
    superAdminState.value = { data: false, isLoading: false }
    signInAs(OWNER)
    metadataState.value = {
      data: { course_owner: OWNER, course_admins: [ADMIN] },
      isLoading: false,
      isError: false,
    }
  })

  afterEach(() => {
    globalThis.__TEST_AUTH__ = undefined
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.location.hash = ''
    globalThis.__TEST_ROUTER__ = undefined
  })

  it('skip link moves focus to the admin content panel', async () => {
    globalThis.__TEST_ROUTER__ = { pathname: '/[course_name]/ai-models' }
    render(
      <ThemeProvider>
        <AdminLayout courseName="CS101">
          <p>content</p>
        </AdminLayout>
      </ThemeProvider>,
    )
    const link = screen.getByRole('link', { name: 'Skip to admin content' })
    expect(link).toHaveAttribute('href', '#admin-panel-content')
    await userEvent.setup().click(link)
    expect(document.getElementById('admin-panel-content')).toHaveFocus()
  })

  it('flags the document while mounted so the app skip link is hidden', () => {
    globalThis.__TEST_ROUTER__ = { pathname: '/[course_name]/ai-models' }
    const { unmount } = render(
      <ThemeProvider>
        <AdminLayout courseName="CS101">
          <p>content</p>
        </AdminLayout>
      </ThemeProvider>,
    )
    expect(document.documentElement).toHaveAttribute('data-admin-layout')
    unmount()
    expect(document.documentElement).not.toHaveAttribute('data-admin-layout')
  })

  describe('access check', () => {
    const renderLayout = () =>
      render(
        <ThemeProvider>
          <AdminLayout courseName="CS101">
            <p>admin page content</p>
          </AdminLayout>
        </ThemeProvider>,
      )

    beforeEach(() => {
      globalThis.__TEST_ROUTER__ = { pathname: '/[course_name]/ai-models' }
    })

    it('shows the page to the chatbot owner', () => {
      renderLayout()

      expect(screen.getByText('admin page content')).toBeInTheDocument()
    })

    it('shows the page to a chatbot admin', () => {
      signInAs(ADMIN)
      renderLayout()

      expect(screen.getByText('admin page content')).toBeInTheDocument()
    })

    it('shows the page to a super admin who is not on the chatbot', () => {
      signInAs('root@example.com')
      superAdminState.value = { data: true, isLoading: false }
      renderLayout()

      expect(screen.getByText('admin page content')).toBeInTheDocument()
    })

    it('lets a super admin in even when the chatbot metadata cannot be read', () => {
      signInAs('root@example.com')
      superAdminState.value = { data: true, isLoading: false }
      metadataState.value = { data: undefined, isLoading: false, isError: true }
      renderLayout()

      expect(screen.getByText('admin page content')).toBeInTheDocument()
    })

    it('denies a user whose super-admin lookup failed', () => {
      signInAs('student@example.com')
      superAdminState.value = { data: undefined, isLoading: false }
      renderLayout()

      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('shows nothing of the page while the super-admin lookup is loading', () => {
      signInAs('root@example.com')
      superAdminState.value = { data: undefined, isLoading: true }
      renderLayout()

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('shows the 403 permission screen to everyone else, without the page', () => {
      signInAs('student@example.com')
      renderLayout()

      expect(
        screen.getByRole('heading', {
          name: "You don't have sufficient permissions",
        }),
      ).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('shows the 404 screen for a chatbot that does not exist, even to a super admin', () => {
      signInAs('root@example.com')
      superAdminState.value = { data: true, isLoading: false }
      metadataState.value = {
        data: undefined,
        isLoading: false,
        isError: true,
        error: Object.assign(new Error('Not Found'), { status: 404 }),
      }
      renderLayout()

      expect(
        screen.getByRole('heading', { name: 'Chatbot not found' }),
      ).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('shows the 403 screen when the server refuses the metadata', () => {
      metadataState.value = {
        data: undefined,
        isLoading: false,
        isError: true,
        error: Object.assign(new Error('Forbidden'), { status: 403 }),
      }
      renderLayout()

      expect(
        screen.getByRole('heading', {
          name: "You don't have sufficient permissions",
        }),
      ).toBeInTheDocument()
    })

    it('shows the 403 screen for a frozen chatbot, even to its owner', () => {
      metadataState.value = {
        data: { course_owner: OWNER, course_admins: [], is_frozen: true },
        isLoading: false,
        isError: false,
      }
      renderLayout()

      expect(
        screen.getByRole('heading', {
          name: "You don't have sufficient permissions",
        }),
      ).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('shows nothing of the page until the router has read the URL', () => {
      globalThis.__TEST_ROUTER__ = {
        pathname: '/[course_name]/ai-models',
        isReady: false,
      }
      metadataState.value = {
        data: undefined,
        isLoading: false,
        isError: false,
      }
      renderLayout()

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: /sufficient permissions/ }),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('asks signed-out users to sign in', () => {
      globalThis.__TEST_AUTH__ = { isAuthenticated: false, user: null }
      renderLayout()

      expect(
        screen.getByRole('heading', { name: 'Sign in required' }),
      ).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('shows nothing of the page while the access check is loading', () => {
      metadataState.value = { data: undefined, isLoading: true, isError: false }
      renderLayout()

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('denies access when the chatbot metadata cannot be read', () => {
      metadataState.value = { data: undefined, isLoading: false, isError: true }
      renderLayout()

      expect(
        screen.getByRole('heading', {
          name: "You don't have sufficient permissions",
        }),
      ).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })
  })
})
