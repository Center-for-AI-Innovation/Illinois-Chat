import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const savedUseIllinoisChatConfig =
  process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG

function renderAt(pathname: string) {
  globalThis.__TEST_ROUTER__ = { pathname }
  return render(<SiteAnnouncementBanner />)
}

function bannerHeightVariable() {
  return document.documentElement.style.getPropertyValue(
    '--announcement-banner-height',
  )
}

beforeEach(() => {
  query.data = undefined
  // Without Illinois Chat config the legacy chain renders the rebrand notice,
  // which makes "did the fallback fire" observable.
  delete process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG
})

afterEach(() => {
  globalThis.__TEST_ROUTER__ = undefined
  document.documentElement.style.removeProperty('--announcement-banner-height')
  if (savedUseIllinoisChatConfig === undefined) {
    delete process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG
  } else {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG =
      savedUseIllinoisChatConfig
  }
})

describe('SiteAnnouncementBanner', () => {
  it('shows the configured banner on any page', () => {
    query.data = ENABLED
    renderAt('/[course_name]/chat')

    expect(screen.getByText('Downtime Saturday 8pm.')).toBeInTheDocument()
  })

  it('skips /admin, which has its own live preview', () => {
    query.data = ENABLED
    renderAt('/admin')

    expect(screen.queryByText('Downtime Saturday 8pm.')).not.toBeInTheDocument()
    expect(bannerHeightVariable()).toBe('0px')
  })

  it('skips the silent-renew iframe', () => {
    query.data = ENABLED
    renderAt('/silent-renew')

    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('keeps the legacy fallback on the home page only', () => {
    query.data = null
    const { unmount } = renderAt('/')
    expect(screen.getByText(/rebranded to Illinois Chat/)).toBeInTheDocument()
    unmount()

    renderAt('/chatbots')
    expect(screen.queryByText(/rebranded to Illinois Chat/)).not.toBeInTheDocument()
  })

  it('renders nothing until the first fetch lands', () => {
    renderAt('/chatbots')

    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
  })

  it('resets the height variable when it unmounts', () => {
    query.data = ENABLED
    const { unmount } = renderAt('/chatbots')
    document.documentElement.style.setProperty(
      '--announcement-banner-height',
      '44px',
    )

    unmount()
    expect(bannerHeightVariable()).toBe('0px')
  })
})
