import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SidebarProvider } from '@/components/shadcn/ui/sidebar'
import { ThemeProvider } from '~/contexts/ThemeContext'
import { AdminSidebar } from '../AdminSidebar'
import { ADMIN_SETTINGS_PAGES } from '../admin-pages'

function renderSidebar(pathname: string) {
  globalThis.__TEST_ROUTER__ = { pathname }
  return render(
    <ThemeProvider>
      <SidebarProvider>
        <AdminSidebar courseName="CS101" />
        {/* Stand-in for AdminLayout's scrolling content. */}
        <main id="admin-panel-content">
          <h2 id="default-model">Set the Default Model</h2>
          <h2 id="commercial">Commercial LLMs</h2>
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
      screen.getByRole('link', { name: 'Commercial LLMs' }),
    ).not.toHaveAttribute('data-active')
    expect(
      screen.getByRole('link', { name: 'AI Models (LLMs)' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('follows the URL hash', () => {
    renderSidebar('/[course_name]/ai-models')

    act(() => {
      window.location.hash = '#commercial'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(
      screen.getByRole('link', { name: 'Commercial LLMs' }),
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

  it('scrolls to a section heading in place when on that page', async () => {
    const user = userEvent.setup()
    renderSidebar('/[course_name]/ai-models')

    await user.click(screen.getByRole('link', { name: 'Commercial LLMs' }))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(
      document.getElementById('commercial'),
    )
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    )
    expect(window.location.hash).toBe('#commercial')
    expect(
      screen.getByRole('link', { name: 'Commercial LLMs' }),
    ).toHaveAttribute('aria-current', 'location')
  })

  it('scrolls back to the top when the current page item is clicked', async () => {
    const user = userEvent.setup()
    window.location.hash = '#commercial'
    renderSidebar('/[course_name]/ai-models')

    await user.click(screen.getByRole('link', { name: 'AI Models (LLMs)' }))

    expect(scrollTo.mock.contexts[0]).toBe(
      document.getElementById('admin-panel-content'),
    )
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    expect(window.location.hash).toBe('')
    expect(
      screen.getByRole('link', { name: 'Set the Default Model' }),
    ).toHaveAttribute('aria-current', 'location')
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

  it('keeps the active section after an in-place click and a re-render', async () => {
    const user = userEvent.setup()
    const { rerender } = renderSidebar('/[course_name]/ai-models')

    await user.click(screen.getByRole('link', { name: 'Commercial LLMs' }))
    rerender(
      <ThemeProvider>
        <SidebarProvider>
          <AdminSidebar courseName="CS101" />
        </SidebarProvider>
      </ThemeProvider>,
    )

    expect(
      screen.getByRole('link', { name: 'Commercial LLMs' }),
    ).toHaveAttribute('data-active')
  })

  it('moves the highlight as the reader scrolls, without touching the URL', async () => {
    renderSidebar('/[course_name]/ai-models')
    const main = document.getElementById('admin-panel-content') as HTMLElement
    const rect = (top: number) => ({ top }) as DOMRect
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(rect(0))
    vi.spyOn(
      document.getElementById('default-model') as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue(rect(-300))
    vi.spyOn(
      document.getElementById('commercial') as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue(rect(40))
    const before = window.location.href

    act(() => {
      main.dispatchEvent(new Event('scroll'))
    })

    await vi.waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Commercial LLMs' }),
      ).toHaveAttribute('data-active'),
    )
    expect(
      screen.getByRole('link', { name: 'Set the Default Model' }),
    ).not.toHaveAttribute('data-active')
    expect(window.location.href).toBe(before)
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
