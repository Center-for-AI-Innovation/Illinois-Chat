import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteAnnouncementBanner } from '~/components/UIUC-Components/SiteAnnouncementBanner'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'

const query = vi.hoisted(() => ({
  banner: undefined as AnnouncementBanner | null | undefined,
  options: undefined as { enabled?: boolean } | undefined,
}))

vi.mock('~/hooks/queries/useFetchSiteStatus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '~/hooks/queries/useFetchSiteStatus',
  )
  return {
    ...actual,
    useFetchSiteStatus: (options: { enabled?: boolean }) => {
      query.options = options
      return {
        data:
          query.banner === undefined
            ? undefined
            : { announcementBanner: query.banner },
      }
    },
  }
})

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
  query.banner = undefined
  query.options = undefined
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
    query.banner = ENABLED
    renderAt('/[course_name]/chat')

    expect(screen.getByText('Downtime Saturday 8pm.')).toBeInTheDocument()
  })

  it('shows the saved announcement on /admin, so operators see what visitors see', () => {
    query.banner = ENABLED
    renderAt('/admin')

    expect(
      screen.getByRole('region', { name: 'Site announcement' }),
    ).toHaveTextContent('Downtime Saturday 8pm.')
  })

  it('skips the silent-renew iframe', () => {
    query.banner = ENABLED
    renderAt('/silent-renew')

    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(bannerHeightVariable()).toBe('0px')
  })

  it('does not poll on the silent-renew iframe', () => {
    renderAt('/silent-renew')

    expect(query.options?.enabled).toBe(false)
  })

  it('polls on /admin, so an open admin tab follows the saved banner', () => {
    renderAt('/admin')

    expect(query.options?.enabled).toBe(true)
  })

  it('polls on regular pages', () => {
    renderAt('/chatbots')

    expect(query.options?.enabled).toBe(true)
  })

  it('keeps the legacy fallback on the home page only', () => {
    query.banner = null
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
    query.banner = ENABLED
    const { unmount } = renderAt('/chatbots')
    document.documentElement.style.setProperty(
      '--announcement-banner-height',
      '44px',
    )

    unmount()
    expect(bannerHeightVariable()).toBe('0px')
  })
})
