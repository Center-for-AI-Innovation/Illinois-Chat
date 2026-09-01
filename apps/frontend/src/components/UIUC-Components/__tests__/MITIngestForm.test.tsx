import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  createTestQueryClient,
  renderWithProviders,
} from '~/test-utils/renderWithProviders'

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => React.createElement('div', props),
    },
  ),
}))

async function renderForm() {
  const queryClient = createTestQueryClient()
  const { default: MITIngestForm } = await import('../MITIngestForm')
  renderWithProviders(<MITIngestForm />, { queryClient })
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText(/Configure import/i))
}

describe('MITIngestForm', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the trigger card with MIT branding and description', async () => {
    await renderForm()

    expect(screen.getByText('MIT Course')).toBeInTheDocument()
    expect(
      screen.getByText(/Import content from MIT OpenCourseWare/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Configure import/i)).toBeInTheDocument()
    expect(screen.getByAltText('MIT OCW Logo')).toBeInTheDocument()
  })

  it('opens the dialog when clicking the trigger card', async () => {
    const user = userEvent.setup()
    await renderForm()

    await openDialog(user)

    expect(
      await screen.findByRole(
        'heading',
        { name: /Ingest MIT Course/i },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter URL...')).toBeInTheDocument()
  })

  it('opens the dialog via keyboard on the trigger card', async () => {
    await renderForm()

    const card = screen.getByRole('button', { name: /MIT Course/i })
    fireEvent.keyDown(card, { key: 'Enter' })

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Enter URL...')).toBeInTheDocument(),
    )
  })

  it('advertises that MIT ingest is unavailable and disables the controls', async () => {
    const user = userEvent.setup()
    await renderForm()

    await openDialog(user)

    expect(
      await screen.findByText(/MIT ingest is temporarily unavailable/i),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter URL...')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /Ingest MIT Course/i }),
    ).toBeDisabled()
  })

  it('shows the example MIT OCW link', async () => {
    const user = userEvent.setup()
    await renderForm()

    await openDialog(user)

    const link = await screen.findByText(
      'https://ocw.mit.edu/courses/8-321-quantum-theory-i-fall-2017',
    )
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://ocw.mit.edu/courses/8-321-quantum-theory-i-fall-2017',
    )
  })

  it('clears the url when the dialog is closed', async () => {
    const user = userEvent.setup()
    await renderForm()

    await openDialog(user)
    const input = await screen.findByPlaceholderText('Enter URL...')
    expect(input).toHaveValue('')

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('Enter URL...'),
      ).not.toBeInTheDocument(),
    )

    await openDialog(user)
    expect(await screen.findByPlaceholderText('Enter URL...')).toHaveValue('')
  })
})
