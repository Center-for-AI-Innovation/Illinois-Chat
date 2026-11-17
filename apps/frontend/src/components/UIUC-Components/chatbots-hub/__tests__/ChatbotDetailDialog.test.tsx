import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { ChatbotDetailDialog } from '../ChatbotDetailDialog'
import type { ChatbotCardData } from '../chatbots.types'

const useFetchDocumentSummaryMock = vi.hoisted(() => vi.fn())
const useFetchMaintainerProfilesMock = vi.hoisted(() => vi.fn())

vi.mock('~/hooks/queries/useFetchDocumentSummary', () => ({
  useFetchDocumentSummary: useFetchDocumentSummaryMock,
}))
vi.mock('~/hooks/queries/useFetchMaintainerProfiles', () => ({
  useFetchMaintainerProfiles: useFetchMaintainerProfilesMock,
}))
vi.mock('~/hooks/queries/useFetchCourseMetadata', () => ({
  useFetchCourseMetadata: () => ({ data: undefined }),
}))
vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ user: { profile: { email: 'me@example.com' } } }),
}))

const defaultCard: ChatbotCardData = {
  course_name: 'CS101',
  title: 'CS101',
  description: '',
  owner: 'You',
  collaboratorCount: 0,
}

function renderDialog({
  summary = {},
  maintainers = {},
  card = defaultCard,
}: {
  summary?: Record<string, unknown>
  maintainers?: Record<string, unknown>
  card?: ChatbotCardData
}) {
  useFetchDocumentSummaryMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...summary,
  })
  useFetchMaintainerProfilesMock.mockReturnValue({
    data: [],
    isLoading: false,
    ...maintainers,
  })
  return renderWithProviders(
    <ChatbotDetailDialog
      open
      onOpenChange={() => {}}
      card={card}
      onShareClick={() => {}}
    />,
  )
}

describe('ChatbotDetailDialog loading states', () => {
  it('shows skeletons instead of the empty message while loading', () => {
    renderDialog({
      summary: { isLoading: true },
      maintainers: { isLoading: true },
    })
    expect(
      screen.queryByText('No document data available yet.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Maintained By')).toBeInTheDocument()
    expect(
      document.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
  })

  it('shows an error message when the summary fails to load', () => {
    renderDialog({ summary: { isError: true } })
    expect(
      screen.getByText('Could not load document data.'),
    ).toBeInTheDocument()
  })

  it('shows the empty message once loaded with no data', () => {
    renderDialog({})
    expect(
      screen.getByText('No document data available yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Maintained By')).not.toBeInTheDocument()
  })

  it('enables both queries only when the dialog is open', () => {
    renderDialog({})
    expect(useFetchDocumentSummaryMock).toHaveBeenCalledWith('CS101', {
      enabled: true,
    })
    expect(useFetchMaintainerProfilesMock).toHaveBeenCalledWith('CS101', {
      enabled: true,
    })
  })
})

function adminCard(userRole: ChatbotCardData['userRole']): ChatbotCardData {
  return {
    course_name: 'new-project',
    title: 'new-project',
    description: 'A project with no stored admins',
    owner: 'owner@example.com',
    collaboratorCount: 0,
    userRole,
    accessLevel: 'private',
    isPrivate: true,
  }
}

describe('ChatbotDetailDialog admin settings', () => {
  it('shows Admin Settings for a super admin who is not a stored project member', () => {
    renderDialog({ card: adminCard('admin') })
    expect(
      screen.getByRole('link', { name: /Admin Settings/ }),
    ).toHaveAttribute('href', '/new-project/dashboard')
  })

  it('hides Admin Settings when the card has no owner or admin role', () => {
    renderDialog({ card: adminCard(undefined) })
    expect(
      screen.queryByRole('link', { name: /Admin Settings/ }),
    ).not.toBeInTheDocument()
  })
})
