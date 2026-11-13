import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { server } from '~/test-utils/server'

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
      enabled: false,
      message: '',
      linkText: '',
      linkUrl: '',
    },
    maintenance: { enabled: false, titleText: '', bodyText: '' },
    navbarBranding: {
      primaryWord: 'Illinois',
      secondaryWord: 'Chat',
      logoDataUrl: '',
    },
  },
  bannerState: 'configured',
}

let savedBody: any

beforeEach(() => {
  savedBody = undefined
  server.use(
    http.get('*/api/admin/settings', () => HttpResponse.json(SETTINGS)),
    http.put('*/api/admin/settings', async ({ request }) => {
      savedBody = await request.json()
      return HttpResponse.json({
        saved: true,
        revalidated: true,
        updatedAt: '2026-09-25T00:00:00.000Z',
        updatedBy: 'admin@example.com',
      })
    }),
  )
})

async function renderForm() {
  const { PlatformSettingsForm } = await import('../PlatformSettingsForm')
  renderWithProviders(<PlatformSettingsForm />)
  await screen.findByDisplayValue('Illinois')
}

function preview() {
  const card = screen
    .getByRole('heading', { name: 'Navbar branding' })
    .closest('[data-slot=card]') as HTMLElement
  return within(card)
    .getByText('Preview')
    .closest('[data-slot=field]') as HTMLElement
}

describe('NavbarBrandingCard', () => {
  it('previews edited words live', async () => {
    const user = userEvent.setup()
    await renderForm()

    const first = screen.getByLabelText('First word')
    await user.clear(first)
    await user.type(first, 'OSC')

    expect(within(preview()).getByText(/OSC/)).toBeInTheDocument()
  })

  it('rejects a multi-word entry', async () => {
    const user = userEvent.setup()
    await renderForm()

    const first = screen.getByLabelText('First word')
    await user.clear(first)
    await user.type(first, 'Ohio State')
    await user.tab()

    expect(
      await screen.findByText('First word must be a single word'),
    ).toBeInTheDocument()
  })

  it('previews an uploaded logo and saves it with the rest of the form', async () => {
    const user = userEvent.setup()
    await renderForm()

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
      type: 'image/png',
    })
    await user.upload(screen.getByLabelText('Upload navbar logo'), file)

    await waitFor(() =>
      expect(preview().querySelector('img')).toHaveAttribute(
        'src',
        expect.stringMatching(/^data:image\/png;base64,/),
      ),
    )
    expect(screen.getByRole('img', { name: 'Uploaded logo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() =>
      expect(savedBody?.navbarBranding.logoDataUrl).toMatch(
        /^data:image\/png;base64,/,
      ),
    )
  })

  it('refuses an oversized file before encoding it', async () => {
    const user = userEvent.setup()
    await renderForm()

    const file = new File([new Uint8Array(256 * 1024 + 1)], 'huge.png', {
      type: 'image/png',
    })
    await user.upload(screen.getByLabelText('Upload navbar logo'), file)

    expect(await screen.findByText('That file is over 256 KB.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Default logo' })).toBeInTheDocument()
  })

  it('disables reset while everything is already default', async () => {
    const user = userEvent.setup()
    await renderForm()

    const reset = screen.getByRole('button', { name: /Reset to defaults/ })
    expect(reset).toBeDisabled()

    const second = screen.getByLabelText('Second word')
    await user.clear(second)
    await user.type(second, 'Bot')
    expect(reset).toBeEnabled()
  })

  it('resets the words and the logo together', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/admin/settings', () =>
        HttpResponse.json({
          ...SETTINGS,
          settings: {
            ...SETTINGS.settings,
            navbarBranding: {
              primaryWord: 'OSC',
              secondaryWord: 'Assistant',
              logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
            },
          },
        }),
      ),
    )
    const { PlatformSettingsForm } = await import('../PlatformSettingsForm')
    renderWithProviders(<PlatformSettingsForm />)
    await screen.findByDisplayValue('OSC')

    await user.click(screen.getByRole('button', { name: /Reset to defaults/ }))

    expect(screen.getByLabelText('First word')).toHaveValue('Illinois')
    expect(screen.getByLabelText('Second word')).toHaveValue('Chat')
    expect(screen.getByRole('img', { name: 'Default logo' })).toHaveAttribute(
      'src',
      '/media/logo_illinois.png',
    )
    expect(screen.getByRole('button', { name: /Reset to defaults/ })).toBeDisabled()
  })
})
