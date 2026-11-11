import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

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

    document.getElementById('main-content')!.dispatchEvent(new Event('wheel'))
    expect(disconnect).toHaveBeenCalled()
  })
})
