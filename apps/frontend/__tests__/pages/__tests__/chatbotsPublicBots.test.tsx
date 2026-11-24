import { screen, within } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatbotCardData } from '~/components/UIUC-Components/chatbots-hub/chatbots.types'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import type { CourseMetadata } from '~/types/courseMetadata'
import { toChatbotCardData } from '~/utils/chatbotCard'

const featured = vi.hoisted(() => ({ cards: [] as ChatbotCardData[] }))

vi.mock('~/hooks/queries/useFetchFeaturedChatbots', () => ({
  useFetchFeaturedChatbots: () => ({ data: featured.cards, isLoading: false }),
}))

vi.mock('~/hooks/queries/useSearchChatbots', () => ({
  useSearchChatbots: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
}))

// Renders each section's title and the cards the page hands it, so the test
// checks the page's own filtering rather than the section component.
vi.mock('~/components/UIUC-Components/chatbots-hub/ChatbotsSection', () => ({
  ChatbotsSection: ({
    title,
    cards,
  }: {
    title: string
    cards?: ChatbotCardData[]
  }) => (
    <section aria-label={title}>
      {cards?.map((card) => (
        <div key={card.course_name} data-testid="card">
          {card.course_name}:{card.userRole ?? 'none'}
        </div>
      ))}
    </section>
  ),
}))

const ME = 'me@example.com'
const OTHER = 'someone@example.com'

function metadata(overrides: Partial<CourseMetadata> = {}): CourseMetadata {
  return {
    course_owner: OTHER,
    course_admins: [],
    is_private: false,
    ...overrides,
  } as CourseMetadata
}

/** The featured payload, built the same way getFeaturedChatbots builds it. */
function featuredFor(isPlatformSuperAdmin: boolean): ChatbotCardData[] {
  return [
    toChatbotCardData('public-bot', metadata(), ME, isPlatformSuperAdmin),
    toChatbotCardData(
      'owned-bot',
      metadata({ course_owner: ME }),
      ME,
      isPlatformSuperAdmin,
    ),
    toChatbotCardData(
      'admined-bot',
      metadata({ course_admins: [ME] }),
      ME,
      isPlatformSuperAdmin,
    ),
  ]
}

async function renderHub() {
  const ChatbotsHubPage = (await import('~/pages/chatbots')).default
  return renderWithProviders(<ChatbotsHubPage />)
}

function publicBotCards() {
  const section = screen.queryByRole('region', { name: 'Public Bots' })
  return section
    ? within(section)
        .queryAllByTestId('card')
        .map((card) => card.textContent)
    : null
}

beforeEach(() => {
  globalThis.__TEST_AUTH__ = {
    isLoading: false,
    isAuthenticated: true,
    user: { profile: { sub: 'u1', email: ME } },
  }
  globalThis.__TEST_ROUTER__ = {
    pathname: '/chatbots',
    asPath: '/chatbots',
    query: {},
  }
})

describe('/chatbots Public Bots section', () => {
  it('shows other people’s public bots to a regular user, without a role', async () => {
    featured.cards = featuredFor(false)
    await renderHub()

    expect(publicBotCards()).toEqual(['public-bot:none'])
  })

  it('keeps the section for a super admin, with the admin role on the card', async () => {
    featured.cards = featuredFor(true)
    await renderHub()

    expect(publicBotCards()).toEqual(['public-bot:admin'])
  })

  it('leaves out bots the user owns or admins, which belong in Your Bots', async () => {
    featured.cards = featuredFor(true)
    await renderHub()

    const cards = publicBotCards() ?? []
    expect(cards.some((card) => card?.startsWith('owned-bot'))).toBe(false)
    expect(cards.some((card) => card?.startsWith('admined-bot'))).toBe(false)
  })
})
