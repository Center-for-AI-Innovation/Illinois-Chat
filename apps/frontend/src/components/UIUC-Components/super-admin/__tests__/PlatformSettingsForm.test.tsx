import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { server } from '~/test-utils/server'
import { PlatformSettingsForm } from '../PlatformSettingsForm'

vi.mock('~/utils/toastUtils', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

const initial = {
  version: '0',
  bannerState: 'absent',
  settings: {
    announcementBanner: {
      enabled: false,
      message: '',
      linkText: '',
      linkUrl: '',
    },
    maintenance: { enabled: false, titleText: 'Initial title', bodyText: '' },
  },
}

beforeEach(() => {
  server.use(http.get('*/api/admin/settings', () => HttpResponse.json(initial)))
})

describe('platform settings saves', () => {
  it('saves only maintenance and uses the new version on the next save', async () => {
    const writes: unknown[] = []
    let current = initial
    server.use(
      http.get('*/api/admin/settings', () => HttpResponse.json(current)),
    )
    server.use(
      http.put('*/api/admin/settings', async ({ request }) => {
        const body = (await request.json()) as {
          maintenance: typeof initial.settings.maintenance
        }
        writes.push(body)
        current = {
          ...initial,
          version: `saved-${writes.length}`,
          settings: { ...initial.settings, maintenance: body.maintenance },
        }
        return HttpResponse.json({
          saved: true,
          revalidated: true,
          version: `saved-${writes.length}`,
        })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlatformSettingsForm />)
    const title = await screen.findByDisplayValue('Initial title')
    await user.clear(title)
    await user.type(title, 'New title')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({
      version: '0',
      maintenance: { enabled: false, titleText: 'New title', bodyText: '' },
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeDisabled(),
    )
    await user.type(title, ' updated')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1]).toMatchObject({ version: 'saved-1' })
  })

  it('does not expose editable defaults when the settings store is unreachable', async () => {
    server.use(
      http.get('*/api/admin/settings', () =>
        HttpResponse.json({
          ...initial,
          bannerState: 'unavailable',
          warning: 'Settings store unreachable',
        }),
      ),
    )
    renderWithProviders(<PlatformSettingsForm />)
    await screen.findByText('Could not load platform settings')
    expect(
      screen.queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('keeps the form editable when the stored banner is malformed', async () => {
    let submitted: unknown
    server.use(
      http.get('*/api/admin/settings', () =>
        HttpResponse.json({
          ...initial,
          bannerState: 'invalid',
          warning: 'announcement_banner is not valid JSON',
        }),
      ),
      http.put('*/api/admin/settings', async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json({
          saved: true,
          revalidated: true,
          version: 'saved',
        })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlatformSettingsForm />)
    await screen.findByText(/The stored banner could not be read/)
    const title = await screen.findByDisplayValue('Initial title')
    await user.type(title, ' edited')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(submitted).toEqual({
        version: '0',
        maintenance: {
          enabled: false,
          titleText: 'Initial title edited',
          bodyText: '',
        },
      }),
    )
  })

  it('reloads the latest snapshot when edits are discarded after a conflict', async () => {
    const latest = { ...initial, version: 'new-version' }
    const writes: Array<{ version: string }> = []
    server.use(
      http.put('*/api/admin/settings', async ({ request }) => {
        const body = (await request.json()) as { version: string }
        writes.push(body)
        if (body.version !== latest.version) {
          return HttpResponse.json(
            { error: 'Settings changed since you loaded this form.', current: latest },
            { status: 409 },
          )
        }
        return HttpResponse.json({ saved: true, revalidated: true, version: 'v3' })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PlatformSettingsForm />)
    const title = await screen.findByDisplayValue('Initial title')
    await user.type(title, ' edited')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Settings changed since you loaded this form.')
    server.use(
      http.get('*/api/admin/settings', () => HttpResponse.json(latest)),
    )
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(title).toHaveValue('Initial title'))
    await user.type(title, ' again')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1]).toMatchObject({ version: 'new-version' })
  })

  it('keeps the original form version when a background refetch arrives during editing', async () => {
    let submitted: unknown
    server.use(http.put('*/api/admin/settings', async ({ request }) => {
      submitted = await request.json()
      return HttpResponse.json({ saved: true, revalidated: true, version: 'saved' })
    }))
    const user = userEvent.setup()
    const { queryClient } = renderWithProviders(<PlatformSettingsForm />)
    const title = await screen.findByDisplayValue('Initial title')
    await user.type(title, ' edited')
    server.use(http.get('*/api/admin/settings', () => HttpResponse.json({ ...initial, version: 'other-admin-save' })))
    await queryClient.refetchQueries({ queryKey: ['platformSettings'] })
    expect(title).toHaveValue('Initial title edited')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(submitted).toMatchObject({ version: '0' }))
  })

  it('keeps edits on conflict and reloads only when the admin requests it', async () => {
    const latest = {
      ...initial,
      version: 'new-version',
      settings: {
        ...initial.settings,
        maintenance: {
          ...initial.settings.maintenance,
          titleText: 'Other admin title',
        },
      },
    }
    const write = vi.fn(async () =>
      HttpResponse.json(
        {
          error: 'Settings changed since you loaded this form.',
          current: latest,
        },
        { status: 409 },
      ),
    )
    server.use(http.put('*/api/admin/settings', write))
    const user = userEvent.setup()
    renderWithProviders(<PlatformSettingsForm />)
    const title = await screen.findByDisplayValue('Initial title')
    await user.clear(title)
    await user.type(title, 'My edits')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Settings changed since you loaded this form.')
    expect(title).toHaveValue('My edits')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    server.use(
      http.get('*/api/admin/settings', () => HttpResponse.json(latest)),
    )
    await user.click(
      screen.getByRole('button', {
        name: /Reload latest settings and discard my edits/,
      }),
    )
    await screen.findByDisplayValue('Other admin title')
    expect(write).toHaveBeenCalledTimes(1)
  })
})
