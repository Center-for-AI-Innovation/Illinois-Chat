import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatbotHubCard } from '../ChatbotHubCard'

vi.mock('../ShareSettingsModal', () => ({ default: () => null }))

function renderCard(userRole: 'admin' | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ChatbotHubCard
        course_name="new-project"
        title="new-project"
        description="A project with no stored admins"
        owner="owner@example.com"
        collaboratorCount={0}
        userRole={userRole}
        isPrivate
      />
    </QueryClientProvider>,
  )
}

function dashboardLink() {
  return screen
    .getAllByRole('link')
    .find((link) => link.getAttribute('href') === '/new-project/dashboard')
}

describe('ChatbotHubCard settings gear', () => {
  it('shows the settings gear for an admin who has no raw metadata on the card', () => {
    renderCard('admin')
    expect(dashboardLink()).toBeTruthy()
  })

  it('hides the settings gear when the caller is not an owner or admin', () => {
    renderCard(undefined)
    expect(dashboardLink()).toBeUndefined()
  })
})
