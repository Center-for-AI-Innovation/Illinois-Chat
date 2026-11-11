import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SidebarProvider } from '@/components/shadcn/ui/sidebar'
import { ThemeProvider } from '~/contexts/ThemeContext'
import { AdminSidebar } from '../AdminSidebar'
import { ADMIN_SETTINGS_PAGES } from '../admin-pages'

function renderSidebar(pathname: string, replace = vi.fn()) {
  globalThis.__TEST_ROUTER__ = { pathname, replace }
  return render(
    <ThemeProvider>
      <SidebarProvider>
        <AdminSidebar courseName="CS101" />
        {/* Stand-in for AdminLayout's scrolling content. */}
        <main id="admin-panel-content">
          <h2 id="default-model">Set the Default Model</h2>
          <h2 id="closed-source">Closed Source LLMs</h2>
        </main>
      </SidebarProvider>
    </ThemeProvider>,
  )
}

describe('AdminSidebar', () => {
  // jsdom has no scrolling; vitest.setup stubs these on HTMLElement.prototype.
  let scrollIntoView: ReturnType<typeof vi.spyOn>
  let scrollTo: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    scrollTo = vi
      .spyOn(HTMLElement.prototype, 'scrollTo')
      .mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.__TEST_ROUTER__ = undefined
    window.location.hash = ''
  })

  it('lists every registered page with a course-scoped link', () => {
    renderSidebar('/[course_name]/dashboard')

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/CS101/dashboard',
    )
    for (const page of ADMIN_SETTINGS_PAGES) {
      expect(screen.getByRole('link', { name: page.title })).toHaveAttribute(
        'href',
        `/CS101/${page.path}`,
      )
    }
    expect(screen.getByRole('link', { name: 'Go to Chat' })).toHaveAttribute(
      'href',
      '/CS101/chat',
    )
  })

  it("renders the active page's sections as sub-items, first one active", () => {
    renderSidebar('/[course_name]/ai-models')

    const first = screen.getByRole('link', { name: 'Set the Default Model' })
    expect(first).toHaveAttribute('href', '/CS101/ai-models#default-model')
    expect(first).toHaveAttribute('data-active')
    expect(
      screen.getByRole('link', { name: 'Closed Source LLMs' }),
    ).not.toHaveAttribute('data-active')
    expect(
      screen.getByRole('link', { name: 'AI Models (LLMs)' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('follows the URL hash', () => {
    renderSidebar('/[course_name]/ai-models')

    act(() => {
      window.location.hash = '#closed-source'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(
      screen.getByRole('link', { name: 'Closed Source LLMs' }),
    ).toHaveAttribute('data-active')
    expect(
      screen.getByRole('link', { name: 'Set the Default Model' }),
    ).not.toHaveAttribute('data-active')
  })

  it('highlights a page without sections when it is current', () => {
    renderSidebar('/[course_name]/tools')

    const tools = screen.getByRole('link', { name: 'Tools' })
    expect(tools).toHaveAttribute('data-active')
    expect(tools).toHaveAttribute('aria-current', 'page')
  })

  it('leaves a section link to the router, without scrolling itself', () => {
    renderSidebar('/[course_name]/ai-models')
    const link = screen.getByRole('link', { name: 'Closed Source LLMs' })
    let handlerPrevented: boolean | undefined
    document.addEventListener(
      'click',
      (e) => {
        handlerPrevented = e.defaultPrevented
        e.preventDefault()
      },
      { once: true },
    )
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    )

    expect(handlerPrevented).toBe(false)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('highlights a page that has sections when it is current', () => {
    renderSidebar('/[course_name]/ai-models')

    expect(
      screen.getByRole('link', { name: 'AI Models (LLMs)' }),
    ).toHaveAttribute('data-active')
  })

  it('scrolls back to the top and clears the hash through the router when the current page item is clicked', async () => {
    const user = userEvent.setup()
    const replace = vi.fn()
    window.location.hash = '#closed-source'
    renderSidebar('/[course_name]/ai-models', replace)

    await user.click(screen.getByRole('link', { name: 'AI Models (LLMs)' }))

    expect(scrollTo.mock.contexts[0]).toBe(
      document.getElementById('admin-panel-content'),
    )
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    expect(replace).toHaveBeenCalledWith('/CS101/ai-models', undefined, {
      shallow: true,
      scroll: false,
    })
  })

  it('lets links to other pages navigate normally, without preventDefault', () => {
    renderSidebar('/[course_name]/tools')
    const link = screen.getByRole('link', { name: 'AI Models (LLMs)' })
    // Runs after React's handlers (document is above the root). Record what
    // they did, then cancel so jsdom does not attempt a real navigation.
    let handlerPrevented: boolean | undefined
    document.addEventListener(
      'click',
      (e) => {
        handlerPrevented = e.defaultPrevented
        e.preventDefault()
      },
      { once: true },
    )
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    )
    expect(handlerPrevented).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('changes the theme with the toggle group', async () => {
    const user = userEvent.setup()
    renderSidebar('/[course_name]/ai-models')

    await user.click(screen.getByRole('button', { name: 'Dark' }))

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('marks the closed sidebar inert', () => {
    globalThis.__TEST_ROUTER__ = { pathname: '/[course_name]/ai-models' }
    render(
      <ThemeProvider>
        <SidebarProvider defaultOpen={false}>
          <AdminSidebar courseName="CS101" />
        </SidebarProvider>
      </ThemeProvider>,
    )
    expect(screen.getByLabelText('Project settings')).toHaveAttribute('inert')
  })
})
