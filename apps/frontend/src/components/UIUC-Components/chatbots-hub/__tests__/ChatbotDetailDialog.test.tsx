import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatbotDetailDialog } from '../ChatbotDetailDialog'
import type { ChatbotCardData } from '../chatbots.types'

vi.mock('react-oidc-context', () => ({
  useAuth: () => ({
    user: { profile: { email: 'operator@example.com' } },
  }),
}))

vi.mock('~/hooks/queries/useFetchCourseMetadata', () => ({
  useFetchCourseMetadata: () => ({ data: undefined }),
}))

vi.mock('~/hooks/queries/useFetchDocumentSummary', () => ({
  useFetchDocumentSummary: () => ({ data: undefined }),
}))

vi.mock('~/hooks/queries/useFetchMaintainerProfiles', () => ({
  useFetchMaintainerProfiles: () => ({ data: [] }),
}))

function card(userRole: ChatbotCardData['userRole']): ChatbotCardData {
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

function renderDialog(userRole: ChatbotCardData['userRole']) {
  render(
    <ChatbotDetailDialog
      open
      onOpenChange={() => {}}
      card={card(userRole)}
      onShareClick={() => {}}
    />,
  )
}

describe('ChatbotDetailDialog admin settings', () => {
  it('shows Admin Settings for a super admin who is not a stored project member', () => {
    renderDialog('admin')
    expect(
      screen.getByRole('link', { name: /Admin Settings/ }),
    ).toHaveAttribute('href', '/new-project/dashboard')
  })

  it('hides Admin Settings when the card has no owner or admin role', () => {
    renderDialog(undefined)
    expect(
      screen.queryByRole('link', { name: /Admin Settings/ }),
    ).not.toBeInTheDocument()
  })
})
