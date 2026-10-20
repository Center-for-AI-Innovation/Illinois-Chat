import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '~/test-utils/server'
import { renderWithProviders } from '~/test-utils/renderWithProviders'

const push = vi.fn()
vi.mock('next/router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
}))

import DeleteChatbotCard from '../DeleteChatbotCard'

function mockInfo(external_stores: string[]) {
  server.use(
    http.get('*/api/UIUC-api/chatbotDeletion', () =>
      HttpResponse.json({ external_stores, deletion: null }),
    ),
  )
}

describe('DeleteChatbotCard', () => {
  beforeEach(() => {
    push.mockReset()
  })

  it('enables delete only once the exact name is typed', async () => {
    mockInfo([])
    const user = userEvent.setup()
    renderWithProviders(<DeleteChatbotCard course_name="my-bot" />)

    await user.click(screen.getByRole('button', { name: 'Delete chatbot' }))
    const dialog = await screen.findByRole('dialog')
    const deleteButton = within(dialog).getByRole('button', {
      name: 'Delete chatbot',
    })
    expect(deleteButton).toBeDisabled()

    await user.type(screen.getByLabelText(/to confirm/), 'my-bo')
    expect(deleteButton).toBeDisabled()
    await user.type(screen.getByLabelText(/to confirm/), 't')
    expect(deleteButton).toBeEnabled()
  })

  it('hides the external-storage checkbox when nothing external is connected', async () => {
    mockInfo([])
    const user = userEvent.setup()
    renderWithProviders(<DeleteChatbotCard course_name="my-bot" />)
    await user.click(screen.getByRole('button', { name: 'Delete chatbot' }))
    await screen.findByRole('dialog')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('sends include_external only when the box is ticked', async () => {
    mockInfo(['database', 's3'])
    let body: Record<string, unknown> | undefined
    server.use(
      http.post('*/api/UIUC-api/chatbotDeletion', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          { deletion: { id: 1, status: 'pending' }, queued: true },
          { status: 202 },
        )
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<DeleteChatbotCard course_name="my-bot" />)

    await user.click(screen.getByRole('button', { name: 'Delete chatbot' }))
    const dialog = await screen.findByRole('dialog')
    const checkbox = await within(dialog).findByRole('checkbox')
    expect(screen.getByText(/own database, S3 bucket/)).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    await user.type(screen.getByLabelText(/to confirm/), 'my-bot')
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete chatbot' }),
    )

    await waitFor(() => expect(push).toHaveBeenCalledWith('/chatbots'))
    expect(body).toEqual({
      course_name: 'my-bot',
      confirm_name: 'my-bot',
      include_external: true,
    })
  })
})
