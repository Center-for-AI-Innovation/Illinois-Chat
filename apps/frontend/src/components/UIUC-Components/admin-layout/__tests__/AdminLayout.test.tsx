import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeProvider } from '~/contexts/ThemeContext'
import { AdminLayout } from '../AdminLayout'

const metadataState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}))

vi.mock('~/hooks/queries/useFetchCourseMetadata', () => ({
  useFetchCourseMetadata: () => metadataState.value,
}))

vi.mock('~/components/UIUC-Components/MainPageBackground', () => ({
  LoadingPlaceholderForAdminPages: () => (
    <div data-testid="admin-loading">Loading</div>
  ),
}))

const signIn = vi.hoisted(() => vi.fn())
vi.mock('~/utils/authHelpers', () => ({ initiateSignIn: signIn }))

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

  it('scrolls to the URL hash heading once the page mounts', () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    globalThis.__TEST_ROUTER__ = { pathname: '/[course_name]/ai-models' }
    window.location.hash = '#open-source'

    render(
      <ThemeProvider>
        <AdminLayout courseName="CS101">
          <h2 id="open-source">Open Source LLMs</h2>
        </AdminLayout>
      </ThemeProvider>,
    )

    expect(scrollIntoView.mock.contexts[0]).toBe(
      document.getElementById('open-source'),
    )
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    })
  })

  it('keeps the heading in view as content loads, until the user scrolls', () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    // Other components (e.g. Base UI) also use ResizeObserver, so the stub
    // must be complete and we fire every observer's callback.
    const callbacks: Array<() => void> = []
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callbacks.push(cb)
        }
        observe() {}
        unobserve() {}
        disconnect = disconnect
      },
    )
    globalThis.__TEST_ROUTER__ = { pathname: '/[course_name]/ai-models' }
    window.location.hash = '#open-source'

    render(
      <ThemeProvider>
        <AdminLayout courseName="CS101">
          <h2 id="open-source">Open Source LLMs</h2>
        </AdminLayout>
      </ThemeProvider>,
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    callbacks.forEach((cb) => cb()) // cards replace skeletons above the heading
    expect(scrollIntoView).toHaveBeenCalledTimes(2)

    document
      .getElementById('admin-panel-content')!
      .dispatchEvent(new Event('wheel'))
    expect(disconnect).toHaveBeenCalled()
  })

  it('keeps following when a top-level child is swapped for new content', async () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    const observed: Element[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(el: Element) {
          observed.push(el)
        }
        unobserve() {}
        disconnect() {}
      },
    )
    globalThis.__TEST_ROUTER__ = { pathname: '/[course_name]/ai-models' }
    window.location.hash = '#open-source'

    const { rerender } = render(
      <ThemeProvider>
        <AdminLayout courseName="CS101">
          <div data-testid="skeleton" />
        </AdminLayout>
      </ThemeProvider>,
    )
    const before = scrollIntoView.mock.calls.length

    rerender(
      <ThemeProvider>
        <AdminLayout courseName="CS101">
          <section data-testid="content">
            <h2 id="open-source">Open Source LLMs</h2>
          </section>
        </AdminLayout>
      </ThemeProvider>,
    )
    await waitFor(() =>
      expect(scrollIntoView.mock.calls.length).toBeGreaterThan(before),
    )
    expect(
      observed.some((el) => el.getAttribute('data-testid') === 'content'),
    ).toBe(true)
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

    it('asks signed-out users to sign in', () => {
      globalThis.__TEST_AUTH__ = { isAuthenticated: false, user: null }
      renderLayout()

      expect(
        screen.getByRole('heading', { name: 'Sign in required' }),
      ).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('sends signed-out users back to the admin page they asked for', async () => {
      globalThis.__TEST_AUTH__ = { isAuthenticated: false, user: null }
      globalThis.__TEST_ROUTER__ = {
        pathname: '/[course_name]/ai-models',
        asPath: '/CS101/ai-models#commercial',
      }
      renderLayout()

      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: /sign in/i }))

      expect(signIn).toHaveBeenCalledWith(
        expect.anything(),
        '/CS101/ai-models#commercial',
      )
    })

    it('shows nothing of the page while the access check is loading', () => {
      metadataState.value = { data: undefined, isLoading: true, isError: false }
      renderLayout()

      expect(screen.getByTestId('admin-loading')).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('shows the same loading look while the sign-in state is loading', () => {
      globalThis.__TEST_AUTH__ = { isLoading: true, isAuthenticated: false }
      renderLayout()

      expect(screen.getByTestId('admin-loading')).toBeInTheDocument()
      expect(screen.queryByText('admin page content')).not.toBeInTheDocument()
    })

    it('shows the 404 screen when the chatbot does not exist', () => {
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
