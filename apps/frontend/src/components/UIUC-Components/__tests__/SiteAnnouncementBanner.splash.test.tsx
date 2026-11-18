// Splash (`/`) keeps an empty orange strip when no announcement is active; every
// other page shows nothing. The published `--announcement-banner-height` must
// follow the strip/banner as it appears, changes size, and goes away, because
// the navbar and sticky chrome are positioned from it.

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_SPLASH_STRIP_HEIGHT } from '~/components/UIUC-Components/AnnouncementBanner'
import { SiteAnnouncementBanner } from '~/components/UIUC-Components/SiteAnnouncementBanner'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'

const query = vi.hoisted(() => ({
  data: undefined as AnnouncementBanner | null | undefined,
}))

vi.mock('~/hooks/queries/useFetchAnnouncementBanner', () => ({
  useFetchAnnouncementBanner: () => ({ data: query.data }),
}))

const ENABLED: AnnouncementBanner = {
  enabled: true,
  message: 'Downtime Saturday 8pm.',
  linkText: '',
  linkUrl: '',
}
const DISABLED: AnnouncementBanner = { ...ENABLED, enabled: false }

// A fake ResizeObserver that lets the test play the browser's role: it reports
// a new size of the observed element, and the component must re-publish it.
let resizeCallbacks: Array<() => void> = []
let measuredHeight = 0
const savedResizeObserver = globalThis.ResizeObserver
const savedUseIllinoisChatConfig =
  process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG

class FakeResizeObserver {
  private readonly callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
  }
  observe() {
    resizeCallbacks.push(this.callback)
  }
  unobserve() {}
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((cb) => cb !== this.callback)
  }
}

/** Simulates the strip/banner changing size: updates the measurement, then notifies. */
function resizeTo(height: number) {
  measuredHeight = height
  for (const callback of [...resizeCallbacks]) callback()
}

function publishedHeight() {
  return document.documentElement.style.getPropertyValue(
    '--announcement-banner-height',
  )
}

function renderAt(pathname: string) {
  globalThis.__TEST_ROUTER__ = { pathname }
  return render(<SiteAnnouncementBanner />)
}

beforeEach(() => {
  query.data = undefined
  measuredHeight = 0
  resizeCallbacks = []
  globalThis.ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    () => measuredHeight,
  )
  process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'true'
  delete process.env.NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT
})

afterEach(() => {
  globalThis.ResizeObserver = savedResizeObserver
  vi.restoreAllMocks()
  document.documentElement.style.removeProperty('--announcement-banner-height')
  globalThis.__TEST_ROUTER__ = undefined
  if (savedUseIllinoisChatConfig === undefined) {
    delete process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG
  } else {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = savedUseIllinoisChatConfig
  }
})

describe('splash page (/)', () => {
  it('keeps an empty, aria-hidden strip with no landmark when disabled', () => {
    query.data = DISABLED
    const { container } = renderAt('/')

    const strip = container.querySelector<HTMLElement>('[aria-hidden="true"]')
    expect(strip).not.toBeNull()
    expect(strip).toBeEmptyDOMElement()
    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the strip when there is no banner data at all', () => {
    query.data = null
    const { container } = renderAt('/')

    expect(
      container.querySelector('[aria-hidden="true"]'),
    ).toBeInTheDocument()
  })

  it('shows the active message in the labelled landmark', () => {
    query.data = ENABLED
    renderAt('/')

    expect(
      screen.getByRole('region', { name: 'Site announcement' }),
    ).toHaveTextContent('Downtime Saturday 8pm.')
  })

  it('never shows the disabled message text, and does not fall back to the legacy notice', () => {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'false'
    query.data = DISABLED
    renderAt('/')

    expect(screen.queryByText('Downtime Saturday 8pm.')).not.toBeInTheDocument()
    expect(screen.queryByText(/rebranded to Illinois Chat/)).not.toBeInTheDocument()
  })

  it('publishes the measured strip height, including the empty strip', () => {
    query.data = DISABLED
    renderAt('/')

    resizeTo(41)
    expect(publishedHeight()).toBe(EMPTY_SPLASH_STRIP_HEIGHT)
  })
})

describe('application pages', () => {
  it.each(['/chatbots', '/[course_name]/chat', '/terms'])(
    '%s shows no strip and no space when disabled',
    (pathname) => {
      query.data = DISABLED
      const { container } = renderAt(pathname)

      // The measured wrapper stays mounted, but nothing is inside it.
      expect(container.firstElementChild).toBeEmptyDOMElement()
      resizeTo(0)
      expect(publishedHeight()).toBe('0px')
    },
  )

  it.each(['/chatbots', '/[course_name]/chat'])(
    '%s shows the active message in the landmark and publishes its height',
    (pathname) => {
      query.data = ENABLED
      renderAt(pathname)

      expect(
        screen.getByRole('region', { name: 'Site announcement' }),
      ).toBeInTheDocument()
      resizeTo(44)
      expect(publishedHeight()).toBe('44px')
    },
  )

  it('shows the legacy notice only on the home page', () => {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'false'
    query.data = null
    const { unmount } = renderAt('/')
    expect(screen.getByText(/rebranded to Illinois Chat/)).toBeInTheDocument()
    unmount()

    renderAt('/chatbots')
    expect(screen.queryByText(/rebranded to Illinois Chat/)).not.toBeInTheDocument()
  })

  it.each(['/admin', '/silent-renew'])(
    '%s is exempt: no strip, no landmark, height 0 even on the splash rule',
    (pathname) => {
      query.data = DISABLED
      const { container } = renderAt(pathname)

      expect(container).toBeEmptyDOMElement()
      expect(publishedHeight()).toBe('0px')
    },
  )
})

describe('client navigation and live updates', () => {
  it('drops the strip and its space when navigating from the splash to an application page', () => {
    query.data = DISABLED
    const { container, rerender } = renderAt('/')
    resizeTo(41)
    expect(publishedHeight()).toBe(EMPTY_SPLASH_STRIP_HEIGHT)

    globalThis.__TEST_ROUTER__ = { pathname: '/chatbots' }
    rerender(<SiteAnnouncementBanner />)
    // The strip is removed from the DOM; the browser reports the new size.
    resizeTo(0)

    expect(container.firstElementChild).toBeEmptyDOMElement()
    expect(publishedHeight()).toBe('0px')
  })

  it('adds the strip and its space when navigating from an application page to the splash', () => {
    query.data = DISABLED
    const { container, rerender } = renderAt('/chatbots')
    resizeTo(0)

    globalThis.__TEST_ROUTER__ = { pathname: '/' }
    rerender(<SiteAnnouncementBanner />)
    resizeTo(41)

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(publishedHeight()).toBe(EMPTY_SPLASH_STRIP_HEIGHT)
  })

  it('reflows the published height when an active message wraps to two lines', () => {
    query.data = ENABLED
    renderAt('/chatbots')
    resizeTo(44)
    expect(publishedHeight()).toBe('44px')

    resizeTo(68)
    expect(publishedHeight()).toBe('68px')
  })

  it('updates live when an operator disables the banner while the page is open', () => {
    query.data = ENABLED
    const { rerender } = renderAt('/chatbots')
    resizeTo(44)

    query.data = DISABLED
    rerender(<SiteAnnouncementBanner />)
    resizeTo(0)

    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
    expect(publishedHeight()).toBe('0px')
  })

  it('on the splash, a live disable keeps the strip at its own height rather than collapsing', () => {
    query.data = ENABLED
    const { container, rerender } = renderAt('/')
    resizeTo(44)

    query.data = DISABLED
    rerender(<SiteAnnouncementBanner />)
    resizeTo(41)

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(publishedHeight()).toBe(EMPTY_SPLASH_STRIP_HEIGHT)
  })
})
