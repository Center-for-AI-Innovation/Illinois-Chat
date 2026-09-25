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
import { describe, expect, it, vi } from 'vitest'

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

vi.mock('~/components/UIUC-Components/SiteAnnouncementBanner', () => ({
  SiteAnnouncementBanner: () => null,
}))

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
  })

  it('renders the page normally when maintenance is off', async () => {
    await renderApp({ pathname: '/', isMaintenanceMode: false })

    expect(screen.getByText('Home page content')).toBeInTheDocument()
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
