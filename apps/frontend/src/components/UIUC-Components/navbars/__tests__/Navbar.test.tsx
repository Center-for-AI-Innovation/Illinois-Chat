import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { server } from '~/test-utils/server'

vi.mock('../AuthMenu', () => ({
  AuthMenu: () => React.createElement('div', null, 'AuthMenu'),
}))

function brandingResponds(branding: unknown, status = 200) {
  server.use(
    http.get('*/api/UIUC-api/navbarBranding', () =>
      HttpResponse.json(status === 200 ? { branding } : {}, { status }),
    ),
  )
}

function superAdminIs(isSuperAdmin: boolean) {
  server.use(
    http.get('*/api/admin/me', () =>
      isSuperAdmin
        ? HttpResponse.json({ isSuperAdmin: true })
        : HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
    ),
  )
}

async function renderNavbar(props = {}) {
  const Navbar = (await import('../Navbar')).default
  return renderWithProviders(<Navbar {...props} />)
}

beforeEach(() => {
  globalThis.__TEST_AUTH__ = {
    isLoading: false,
    isAuthenticated: true,
    user: { profile: { sub: 'u1', email: 'u1@example.com' } },
  }
  globalThis.__TEST_ROUTER__ = { asPath: '/chatbots', push: vi.fn() }
})

describe('Navbar', () => {
  it('renders the configured wordmark and uploaded logo', async () => {
    brandingResponds({
      primaryWord: 'OSC',
      secondaryWord: 'Chat',
      logoUrl: '/api/UIUC-api/navbarLogo?v=abc',
    })

    const { container } = await renderNavbar()

    const home = await screen.findByRole('link', { name: 'OSC Chat home' })
    expect(home).toHaveAttribute('href', '/')
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/UIUC-api/navbarLogo?v=abc',
    )
  })

  it('uses the built-in logo when none is uploaded', async () => {
    brandingResponds({ primaryWord: 'OSC', secondaryWord: 'Chat', logoUrl: null })

    const { container } = await renderNavbar()

    await screen.findByRole('link', { name: 'OSC Chat home' })
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/media/logo_illinois.png',
    )
  })

  it('falls back to the default brand when branding cannot be fetched', async () => {
    brandingResponds(null, 503)

    await renderNavbar()

    // The hook retries once with a backoff delay.
    expect(
      await screen.findByRole(
        'link',
        { name: 'Illinois Chat home' },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  })

  it('shows every global link, marking the current page active', async () => {
    superAdminIs(false)
    await renderNavbar()

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: /Docs/ })).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(
      within(nav).getByRole('link', { name: /My Chatbots/ }),
    ).toHaveAttribute('data-active', 'true')
    expect(
      within(nav).getByRole('link', { name: /Create Your Own Bot/ }),
    ).toBeInTheDocument()
    expect(
      within(nav).queryByRole('link', { name: /Admin/ }),
    ).not.toBeInTheDocument()
  })

  it('adds the Admin link only for server-confirmed super admins', async () => {
    superAdminIs(true)
    await renderNavbar()

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(
      await within(nav).findByRole('link', { name: /Admin/ }),
    ).toHaveAttribute('href', '/admin')
  })

  it('opens the same links in the mobile menu', async () => {
    const user = userEvent.setup()
    superAdminIs(false)
    await renderNavbar()

    await user.click(screen.getByRole('button', { name: 'Toggle Menu' }))

    const menu = await screen.findByRole('menu')
    expect(
      within(menu).getByRole('menuitem', { name: /My Chatbots/ }),
    ).toHaveAttribute('href', '/chatbots')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3)
  })

  it('hides the links and menu when plain', async () => {
    await renderNavbar({ isPlain: true })

    expect(
      screen.queryByRole('navigation', { name: 'Main navigation' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Toggle Menu' }),
    ).not.toBeInTheDocument()
  })

  it('holds the auth slot with a skeleton while auth is loading', async () => {
    globalThis.__TEST_AUTH__ = { isLoading: true, isAuthenticated: false }
    await renderNavbar()

    expect(screen.queryByText('AuthMenu')).not.toBeInTheDocument()
  })

  it('defaults to the application layout spanning the workspace', async () => {
    superAdminIs(false)
    await renderNavbar()

    expect(screen.getByRole('banner')).toHaveAttribute(
      'data-variant',
      'application',
    )
    expect(screen.getByRole('banner')).toHaveAttribute(
      'data-layout',
      'workspace',
    )
  })

  it('aligns the splash variant with the hero column', async () => {
    superAdminIs(false)
    await renderNavbar({ variant: 'splash' })

    expect(screen.getByRole('banner')).toHaveAttribute('data-variant', 'splash')
    expect(screen.getByRole('banner')).toHaveAttribute('data-layout', 'splash')
  })

  it.each([
    { contentWidth: 'page', layout: 'page' },
    { contentWidth: 'sidebar', layout: 'sidebar' },
  ] as const)(
    'aligns application pages to the $contentWidth content width',
    async ({ contentWidth, layout }) => {
      superAdminIs(false)
      await renderNavbar({ contentWidth })

      expect(screen.getByRole('banner')).toHaveAttribute(
        'data-variant',
        'application',
      )
      expect(screen.getByRole('banner')).toHaveAttribute('data-layout', layout)
    },
  )

  it('ignores contentWidth for the splash variant', async () => {
    superAdminIs(false)
    await renderNavbar({ variant: 'splash', contentWidth: 'page' })

    expect(screen.getByRole('banner')).toHaveAttribute('data-layout', 'splash')
  })

  describe.each([
    { name: 'application', props: {} },
    { name: 'splash', props: { variant: 'splash' as const } },
    { name: 'admin page', props: { contentWidth: 'page' as const } },
  ])('shared behavior in the $name layout', ({ props }) => {
    it('links the configured brand home', async () => {
      brandingResponds({
        primaryWord: 'OSC',
        secondaryWord: 'Chat',
        logoUrl: null,
      })
      superAdminIs(false)
      await renderNavbar(props)

      expect(
        await screen.findByRole('link', { name: 'OSC Chat home' }),
      ).toHaveAttribute('href', '/')
    })

    it('shows the same global links to every user', async () => {
      superAdminIs(false)
      await renderNavbar(props)

      const nav = screen.getByRole('navigation', { name: 'Main navigation' })
      expect(
        within(nav).getByRole('link', { name: /My Chatbots/ }),
      ).toHaveAttribute('href', '/chatbots')
      expect(
        within(nav).getByRole('link', { name: /Create Your Own Bot/ }),
      ).toHaveAttribute('href', '/new')
      expect(
        within(nav).queryByRole('link', { name: /Admin/ }),
      ).not.toBeInTheDocument()
    })

    it('adds the Admin link only for server-confirmed super admins', async () => {
      superAdminIs(true)
      await renderNavbar(props)

      const nav = screen.getByRole('navigation', { name: 'Main navigation' })
      expect(
        await within(nav).findByRole('link', { name: /Admin/ }),
      ).toHaveAttribute('href', '/admin')
    })

    it('keeps the mobile menu in step with the desktop links', async () => {
      const user = userEvent.setup()
      superAdminIs(true)
      await renderNavbar(props)

      await user.click(screen.getByRole('button', { name: 'Toggle Menu' }))

      const menu = await screen.findByRole('menu')
      expect(
        await within(menu).findByRole('menuitem', { name: /Admin/ }),
      ).toHaveAttribute('href', '/admin')
      expect(within(menu).getAllByRole('menuitem')).toHaveLength(4)
    })
  })
})
