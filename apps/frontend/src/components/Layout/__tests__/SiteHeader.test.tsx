import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from '~/components/Layout/SiteHeader'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'

const query = vi.hoisted(() => ({
  data: undefined as AnnouncementBanner | null | undefined,
}))

vi.mock('~/hooks/queries/useFetchAnnouncementBanner', () => ({
  useFetchAnnouncementBanner: () => ({ data: query.data }),
}))

vi.mock('~/components/UIUC-Components/navbars/AuthMenu', () => ({
  AuthMenu: () => React.createElement('div', null, 'AuthMenu'),
}))

const ENABLED: AnnouncementBanner = {
  enabled: true,
  message: 'Downtime Saturday 8pm.',
  linkText: '',
  linkUrl: '',
}

beforeEach(() => {
  query.data = undefined
  globalThis.__TEST_AUTH__ = {
    isLoading: false,
    isAuthenticated: false,
    user: undefined,
  }
  globalThis.__TEST_ROUTER__ = { pathname: '/chatbots', asPath: '/chatbots' }
})

function renderAt(pathname: string) {
  globalThis.__TEST_ROUTER__ = { pathname, asPath: pathname }
  return renderWithProviders(<SiteHeader />)
}

describe('SiteHeader', () => {
  it('places the announcement and the navbar in one sticky block, bar first', () => {
    query.data = ENABLED
    const { container } = renderAt('/chatbots')

    const header = container.firstElementChild as HTMLElement
    expect(header.className).toContain('sticky')

    const bar = within(header).getByRole('region', { name: 'Site announcement' })
    const navbar = within(header).getByRole('banner')
    expect(bar.compareDocumentPosition(navbar)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('keeps the empty strip above the splash navbar when the banner is off', () => {
    query.data = { ...ENABLED, enabled: false }
    const { container } = renderAt('/')

    // header > [announcement wrapper > strip, navbar]
    const header = container.firstElementChild as HTMLElement
    const [bannerWrapper, navbarWrapper] = Array.from(header.children)
    const strip = bannerWrapper.firstElementChild as HTMLElement
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    expect(strip).toBeEmptyDOMElement()
    expect(navbarWrapper).toContainElement(screen.getByRole('banner'))
    expect(strip).not.toContainElement(screen.getByRole('banner'))
    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
  })

  it('has no strip above the application navbar when the banner is off', () => {
    query.data = { ...ENABLED, enabled: false }
    const { container } = renderAt('/chatbots')

    // header > [announcement wrapper (empty), navbar]: no strip anywhere.
    const header = container.firstElementChild as HTMLElement
    const [bannerWrapper, navbarWrapper] = Array.from(header.children)
    expect(bannerWrapper).toBeEmptyDOMElement()
    expect(navbarWrapper).toContainElement(screen.getByRole('banner'))
    // Scoped to the announcement wrapper: navbar icons are aria-hidden too.
    expect(bannerWrapper.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('renders the splash navbar on the home page', () => {
    query.data = ENABLED
    renderAt('/')

    expect(screen.getByRole('banner')).toHaveAttribute('data-variant', 'splash')
  })

  it.each([
    '/[course_name]/analysis',
    '/[course_name]/api',
    '/[course_name]/dashboard',
    '/[course_name]/llms',
    '/[course_name]/prompt',
    '/[course_name]/tools',
    '/[course_name]/upload',
  ])(
    '%s renders the navbar aligned to the settings sidebar',
    (pathname) => {
      renderAt(pathname)

      expect(screen.getByRole('banner')).toHaveAttribute(
        'data-layout',
        'sidebar',
      )
    },
  )

  it('renders only the announcement on a route without a navbar', () => {
    query.data = ENABLED
    renderAt('/terms')

    expect(screen.getByText('Downtime Saturday 8pm.')).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })

  it('renders nothing on /silent-renew, the hidden Keycloak iframe', () => {
    query.data = ENABLED
    const { container } = renderAt('/silent-renew')

    expect(container.firstElementChild).toBeEmptyDOMElement()
  })

  it('renders the navbar without an empty announcement strip when the banner is off', () => {
    query.data = { ...ENABLED, enabled: false }
    const { container } = renderAt('/chatbots')

    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
    const header = container.firstElementChild as HTMLElement
    expect(within(header).getByRole('banner')).toBeInTheDocument()
  })

  it('server-renders the announcement above the navbar before any client code runs', () => {
    // Regression for the splash-page overlap: the server HTML must already
    // place the bar and the navbar in the same sticky block, so the navbar is
    // never positioned against a height that only exists after measurement.
    query.data = ENABLED
    globalThis.__TEST_ROUTER__ = { pathname: '/', asPath: '/' }

    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <SiteHeader initialBanner={ENABLED} initialBannerReadAt={Date.now()} />
      </QueryClientProvider>,
    )

    expect(html).toContain('Downtime Saturday 8pm.')
    expect(html.indexOf('Site announcement')).toBeGreaterThan(-1)
    expect(html.indexOf('Site announcement')).toBeLessThan(
      html.indexOf('<header'),
    )
  })
})
