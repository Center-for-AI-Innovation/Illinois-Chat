// axe audit for the /admin console. Every panel here is form-heavy and
// dialog-heavy, which is where label, name, and role violations tend to hide.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { server } from '~/test-utils/server'

expect.extend(toHaveNoViolations)

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showWarningToast: vi.fn(),
  showInfoToast: vi.fn(),
}))

const SETTINGS = {
  settings: {
    announcementBanner: {
      enabled: true,
      message: 'Scheduled maintenance Saturday.',
      linkText: 'Status page',
      linkUrl: 'https://status.illinois.edu',
    },
    maintenance: { enabled: false, titleText: '', bodyText: '' },
  },
  bannerState: 'configured',
  updatedAt: '2026-09-08T00:00:00.000Z',
  updatedBy: 'admin@example.com',
}

const ROSTER = {
  envAdmins: ['env@illinois.edu'],
  grantedAdmins: ['granted@illinois.edu'],
}

const CONNECTIONS = {
  connections: [
    {
      project_name: 'alpha',
      is_active: true,
      configured_kinds: ['s3', 'qdrant'],
      updated_at: '2026-09-01T00:00:00.000Z',
      created_at: '2026-08-01T00:00:00.000Z',
    },
    {
      project_name: 'beta',
      is_active: false,
      configured_kinds: [],
      updated_at: null,
      created_at: null,
    },
  ],
}

beforeEach(() => {
  globalThis.__TEST_AUTH__ = {
    isLoading: false,
    isAuthenticated: true,
    user: { profile: { email: 'granted@illinois.edu' } },
  }

  server.use(
    http.get('*/api/admin/settings', () => HttpResponse.json(SETTINGS)),
    http.get('*/api/admin/superAdmins', () => HttpResponse.json(ROSTER)),
    http.get('*/api/UIUC-api/projectConnections/list', () =>
      HttpResponse.json(CONNECTIONS),
    ),
    http.get('*/api/admin/me', () => HttpResponse.json({ isSuperAdmin: true })),
  )
})

describe('admin console accessibility', () => {
  it('PlatformSettingsForm has no violations', async () => {
    const { PlatformSettingsForm } = await import('../PlatformSettingsForm')
    const { container } = renderWithProviders(<PlatformSettingsForm />)

    await screen.findByDisplayValue('Scheduled maintenance Saturday.')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('PlatformSettingsForm labels every control', async () => {
    const { PlatformSettingsForm } = await import('../PlatformSettingsForm')
    renderWithProviders(<PlatformSettingsForm />)

    await screen.findByDisplayValue('Scheduled maintenance Saturday.')

    for (const element of screen.getAllByRole('textbox')) {
      expect(element).toHaveAccessibleName()
    }
    for (const element of screen.getAllByRole('switch')) {
      expect(element).toHaveAccessibleName()
    }
  })

  it('PlatformSettingsForm error state has no violations', async () => {
    server.use(
      http.get('*/api/admin/settings', () =>
        HttpResponse.json({ error: 'nope' }, { status: 503 }),
      ),
    )

    const { PlatformSettingsForm } = await import('../PlatformSettingsForm')
    const { container } = renderWithProviders(<PlatformSettingsForm />)

    // The hook retries once with a backoff delay, so this outlasts the
    // default findBy timeout.
    await screen.findByText(/Could not load platform settings/i, undefined, {
      timeout: 5000,
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('SuperAdminsCard has no violations', async () => {
    const { SuperAdminsCard } = await import('../SuperAdminsCard')
    const { container } = renderWithProviders(<SuperAdminsCard />)

    await screen.findByText('granted@illinois.edu')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('SuperAdminsCard removal dialog has no violations', async () => {
    const user = userEvent.setup()
    const { SuperAdminsCard } = await import('../SuperAdminsCard')
    renderWithProviders(<SuperAdminsCard />)

    await screen.findByText('granted@illinois.edu')
    await user.click(
      screen.getByRole('button', {
        name: /Remove granted@illinois.edu from super admins/i,
      }),
    )

    const dialog = await screen.findByRole('alertdialog')
    const results = await axe(dialog)
    expect(results).toHaveNoViolations()
  })

  it('SuperAdminsCard offers no remove control for env admins', async () => {
    const { SuperAdminsCard } = await import('../SuperAdminsCard')
    renderWithProviders(<SuperAdminsCard />)

    await screen.findByText('env@illinois.edu')

    // The env allowlist is the recovery floor, so the UI must not imply it is
    // editable here.
    expect(
      screen.queryByRole('button', {
        name: /Remove env@illinois.edu from super admins/i,
      }),
    ).not.toBeInTheDocument()
  })

  it('SuperAdminsCard empty state has no violations', async () => {
    server.use(
      http.get('*/api/admin/superAdmins', () =>
        HttpResponse.json({ envAdmins: [], grantedAdmins: [] }),
      ),
    )

    const { SuperAdminsCard } = await import('../SuperAdminsCard')
    const { container } = renderWithProviders(<SuperAdminsCard />)

    await screen.findByText('No super admins')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('ProjectConnectionsTable has no violations', async () => {
    const { ProjectConnectionsTable } = await import(
      '../ProjectConnectionsTable'
    )
    const { container } = renderWithProviders(<ProjectConnectionsTable />)

    await screen.findByText('alpha')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('ProjectConnectionsTable exposes sort state to assistive tech', async () => {
    const user = userEvent.setup()
    const { ProjectConnectionsTable } = await import(
      '../ProjectConnectionsTable'
    )
    renderWithProviders(<ProjectConnectionsTable />)

    await screen.findByText('alpha')

    const projectHeader = screen
      .getByRole('button', { name: /Project/ })
      .closest('th')
    expect(projectHeader).toHaveAttribute('aria-sort', 'ascending')

    await user.click(screen.getByRole('button', { name: /Project/ }))
    expect(projectHeader).toHaveAttribute('aria-sort', 'descending')

    const updatedHeader = screen
      .getByRole('button', { name: /Updated/ })
      .closest('th')
    expect(updatedHeader).toHaveAttribute('aria-sort', 'none')
  })

  it('ProjectConnectionsTable empty state has no violations', async () => {
    server.use(
      http.get('*/api/UIUC-api/projectConnections/list', () =>
        HttpResponse.json({ connections: [] }),
      ),
    )

    const { ProjectConnectionsTable } = await import(
      '../ProjectConnectionsTable'
    )
    const { container } = renderWithProviders(<ProjectConnectionsTable />)

    await screen.findByText('No project connections')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('the access-denied state has no violations', async () => {
    server.use(
      http.get('*/api/admin/me', () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
    )

    const AdminPage = (await import('~/pages/admin')).default
    const { container } = renderWithProviders(<AdminPage />)

    await screen.findByText('Not a super admin')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('the full page has no violations once authorized', async () => {
    const AdminPage = (await import('~/pages/admin')).default
    const { container } = renderWithProviders(<AdminPage />)

    await screen.findByDisplayValue('Scheduled maintenance Saturday.')
    await waitFor(() =>
      expect(screen.getByText('granted@illinois.edu')).toBeInTheDocument(),
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
