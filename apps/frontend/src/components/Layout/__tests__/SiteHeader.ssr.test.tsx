// Server render of the site header with the status cache seeded the way `_app`
// seeds it for a statically generated page. Kept out of SiteHeader.test.tsx
// because that file mocks the status hook, and this one needs the real hook to
// prove the seeded cache is what paints the bar.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from '~/components/Layout/SiteHeader'
import {
  SITE_STATUS_QUERY_KEY,
  type SiteStatus,
} from '~/hooks/queries/useFetchSiteStatus'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'

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
  globalThis.__TEST_AUTH__ = {
    isLoading: false,
    isAuthenticated: false,
    user: undefined,
  }
  globalThis.__TEST_ROUTER__ = { pathname: '/', asPath: '/' }
})

describe('SiteHeader server render', () => {
  it('server-renders the seeded announcement above the navbar before any client code runs', () => {
    // Regression for the splash-page overlap: the server HTML must already
    // place the bar and the navbar in the same sticky block, so the navbar is
    // never positioned against a height that only exists after measurement.
    const queryClient = new QueryClient()
    // The same seed `_app` writes from a home page's getStaticProps.
    queryClient.setQueryData<SiteStatus>(
      SITE_STATUS_QUERY_KEY,
      { announcementBanner: ENABLED },
      { updatedAt: Date.now() },
    )

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <SiteHeader />
      </QueryClientProvider>,
    )

    expect(html).toContain('Downtime Saturday 8pm.')
    expect(html.indexOf('Site announcement')).toBeGreaterThan(-1)
    expect(html.indexOf('Site announcement')).toBeLessThan(
      html.indexOf('<header'),
    )
  })

  it('does not server-render a configured banner that was never seeded', () => {
    // Without a seed the server cannot know the banner, so the configured
    // message must not appear. The navbar still renders from the start.
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <SiteHeader />
      </QueryClientProvider>,
    )

    expect(html).not.toContain('Downtime Saturday 8pm.')
    expect(html).toContain('<header')
  })
})
