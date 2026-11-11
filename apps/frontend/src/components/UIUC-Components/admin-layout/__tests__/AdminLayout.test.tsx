import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

import { ThemeProvider } from '~/contexts/ThemeContext'
import { AdminLayout } from '../AdminLayout'

describe('AdminLayout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.location.hash = ''
    globalThis.__TEST_ROUTER__ = undefined
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
})
