// The maintenance gate has one hard requirement that is easy to regress by
// moving a JSX tag: authentication must keep working while maintenance is on.
//
// Keycloak's `redirect_uri` is the bare origin, so a fresh sign-in returns the
// user to `/` carrying `?code=&state=`, and KeycloakProvider is what exchanges
// that code for a session. If the gate short-circuits above the provider, the
// code is dropped and nobody — including whoever needs to turn maintenance off
// — can sign in. These tests assert the provider stays mounted and only the
// page content is swapped.

import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-i18next', () => ({
  appWithTranslation: (component: unknown) => component,
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}))

vi.mock('next-i18next/pages', () => ({
  appWithTranslation: (component: unknown) => component,
}))

vi.mock('~/providers/KeycloakProvider', () => ({
  KeycloakProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      'div',
      { 'data-testid': 'keycloak-provider' },
      children,
    ),
}))

vi.mock('@mantine/core', () => ({
  MantineProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@mantine/notifications', () => ({
  Notifications: () => null,
}))

vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }))

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}))

vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
  usePostHog: () => ({ identify: vi.fn(), capture: vi.fn() }),
}))

vi.mock('~/contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}))

// The real announcement bar, fed a controllable saved banner, sits inside the
// header. That lets the tests see whether the maintenance gate hides it.
const announcement = vi.hoisted(() => ({
  value: null as {
    enabled: boolean
    message: string
    linkText: string
    linkUrl: string
  } | null,
}))

vi.mock('~/hooks/queries/useFetchAnnouncementBanner', () => ({
  useFetchAnnouncementBanner: () => ({ data: announcement.value }),
}))

vi.mock('~/components/Layout/SiteHeader', async () => {
  const { SiteAnnouncementBanner } = await import(
    '~/components/UIUC-Components/SiteAnnouncementBanner'
  )
  return {
    SiteHeader: () =>
      React.createElement(
        'div',
        null,
        'Site header',
        React.createElement(SiteAnnouncementBanner),
      ),
  }
})

vi.mock('~/components/UIUC-Components/Maintenance', () => ({
  default: () =>
    React.createElement('div', null, 'Site is under maintenance'),
}))

const maintenanceQuery = vi.hoisted(() => ({
  value: undefined as boolean | undefined,
  enabledCalls: [] as (boolean | undefined)[],
}))

vi.mock('~/hooks/queries/useFetchMaintenanceMode', () => ({
  useFetchMaintenanceMode: ({ enabled }: { enabled?: boolean } = {}) => {
    maintenanceQuery.enabledCalls.push(enabled)
    return { data: enabled === false ? undefined : maintenanceQuery.value }
  },
}))

function Page() {
  return <div>Home page content</div>
}

async function renderApp(options: {
  pathname: string
  isMaintenanceMode: boolean | undefined
}) {
  maintenanceQuery.value = options.isMaintenanceMode
  maintenanceQuery.enabledCalls = []
  globalThis.__TEST_ROUTER__ = { pathname: options.pathname }

  const MyApp = (await import('~/pages/_app')).default as React.ComponentType<{
    Component: React.ComponentType
    pageProps: Record<string, unknown>
    router: unknown
  }>

  return render(
    <MyApp Component={Page} pageProps={{}} router={{} as never} />,
  )
}

describe('_app maintenance gate', () => {
  it('keeps KeycloakProvider mounted while maintenance is on', async () => {
    await renderApp({ pathname: '/', isMaintenanceMode: true })

    // The provider that exchanges ?code=&state= is still in the tree, so a
    // fresh sign-in landing on `/` still completes.
    expect(screen.getByTestId('keycloak-provider')).toBeInTheDocument()
    expect(screen.getByText('Site is under maintenance')).toBeInTheDocument()
    expect(screen.queryByText('Home page content')).not.toBeInTheDocument()
    // The header carries the announcement and navbar, which stay hidden too.
    expect(screen.queryByText('Site header')).not.toBeInTheDocument()
  })

  it('renders the page normally when maintenance is off', async () => {
    await renderApp({ pathname: '/', isMaintenanceMode: false })

    expect(screen.getByText('Home page content')).toBeInTheDocument()
    expect(screen.getByText('Site header')).toBeInTheDocument()
    expect(
      screen.queryByText('Site is under maintenance'),
    ).not.toBeInTheDocument()
  })

  it('fails open while the maintenance check has not resolved', async () => {
    await renderApp({ pathname: '/', isMaintenanceMode: undefined })

    // Matches the previous `useState(false)` default: an unreachable or
    // in-flight check must not black out the site.
    expect(screen.getByText('Home page content')).toBeInTheDocument()
  })

  it('serves /admin during maintenance without even asking', async () => {
    await renderApp({ pathname: '/admin', isMaintenanceMode: true })

    expect(screen.getByText('Home page content')).toBeInTheDocument()
    // Exempt from the maintenance gate, but the site header (saved announcement
    // and navbar) still renders above it, so the console is not a bare page.
    expect(screen.getByText('Site header')).toBeInTheDocument()
    expect(
      screen.queryByText('Site is under maintenance'),
    ).not.toBeInTheDocument()
    // Disabling the query matters beyond correctness: /admin must not depend
    // on the same endpoint it exists to fix.
    expect(maintenanceQuery.enabledCalls).toContain(false)
  })

  it('serves /silent-renew during maintenance', async () => {
    await renderApp({ pathname: '/silent-renew', isMaintenanceMode: true })

    expect(screen.getByText('Home page content')).toBeInTheDocument()
    expect(maintenanceQuery.enabledCalls).toContain(false)
  })
})

describe('_app page viewport height', () => {
  // `--page-viewport-height` is what full-height page content uses below the
  // site header. It must subtract the navbar only on routes that render one;
  // MainPageBackground pages without a navbar keep the full banner-adjusted
  // viewport.
  function appRoot(container: HTMLElement) {
    return container.querySelector<HTMLElement>('[data-testid="keycloak-provider"]')
      ?.parentElement as HTMLElement
  }

  it('subtracts the navbar on a route that renders one', async () => {
    const { container } = await renderApp({
      pathname: '/[course_name]/dashboard',
      isMaintenanceMode: false,
    })

    expect(
      appRoot(container).style.getPropertyValue('--page-viewport-height'),
    ).toBe('calc(var(--viewport-height) - var(--navbar-height))')
  })

  it('gives the splash page the 72px navbar token and every other route 80px', async () => {
    const { container } = await renderApp({
      pathname: '/',
      isMaintenanceMode: false,
    })
    expect(appRoot(container).style.getPropertyValue('--navbar-height')).toBe(
      '72px',
    )

    const application = await renderApp({
      pathname: '/chatbots',
      isMaintenanceMode: false,
    })
    expect(
      appRoot(application.container).style.getPropertyValue('--navbar-height'),
    ).toBe('80px')
  })

  it('switches both tokens on client navigation between splash and application routes', async () => {
    const { container, rerender } = await renderApp({
      pathname: '/',
      isMaintenanceMode: false,
    })
    const MyApp = (await import('~/pages/_app')).default as React.ComponentType<{
      Component: React.ComponentType
      pageProps: Record<string, unknown>
      router: unknown
    }>
    const navigate = (pathname: string) => {
      globalThis.__TEST_ROUTER__ = { pathname }
      rerender(<MyApp Component={Page} pageProps={{}} router={{} as never} />)
    }

    navigate('/[course_name]/dashboard')
    expect(appRoot(container).style.getPropertyValue('--navbar-height')).toBe(
      '80px',
    )
    expect(
      appRoot(container).style.getPropertyValue('--page-viewport-height'),
    ).toBe('calc(var(--viewport-height) - var(--navbar-height))')

    navigate('/')
    expect(appRoot(container).style.getPropertyValue('--navbar-height')).toBe(
      '72px',
    )
  })

  it('keeps the banner-adjusted viewport on a route without a navbar', async () => {
    const { container } = await renderApp({
      pathname: '/terms',
      isMaintenanceMode: false,
    })

    expect(
      appRoot(container).style.getPropertyValue('--page-viewport-height'),
    ).toBe('var(--viewport-height)')
  })
})

describe('_app maintenance and the saved announcement', () => {
  const ENABLED = {
    enabled: true,
    message: 'Downtime Saturday 8pm.',
    linkText: '',
    linkUrl: '',
  }

  beforeEach(() => {
    announcement.value = null
  })

  afterEach(() => {
    announcement.value = null
  })

  it('shows an active announcement on /admin while maintenance is on, and the console stays reachable', async () => {
    announcement.value = ENABLED
    await renderApp({ pathname: '/admin', isMaintenanceMode: true })

    expect(
      screen.getByRole('region', { name: 'Site announcement' }),
    ).toHaveTextContent('Downtime Saturday 8pm.')
    expect(screen.getByText('Home page content')).toBeInTheDocument()
    expect(
      screen.queryByText('Site is under maintenance'),
    ).not.toBeInTheDocument()
  })

  it('shows no announcement strip on /admin when the saved banner is inactive', async () => {
    announcement.value = { ...ENABLED, enabled: false }
    await renderApp({ pathname: '/admin', isMaintenanceMode: true })

    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Home page content')).toBeInTheDocument()
  })

  it('hides the announcement and header on ordinary pages while maintenance is on', async () => {
    announcement.value = ENABLED
    await renderApp({ pathname: '/chatbots', isMaintenanceMode: true })

    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Site header')).not.toBeInTheDocument()
    expect(screen.getByText('Site is under maintenance')).toBeInTheDocument()
  })

  it('keeps /silent-renew free of the announcement even when one is active', async () => {
    announcement.value = ENABLED
    await renderApp({ pathname: '/silent-renew', isMaintenanceMode: true })

    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Home page content')).toBeInTheDocument()
  })
})
