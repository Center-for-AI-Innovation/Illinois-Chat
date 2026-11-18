// The splash page keeps an empty decorative orange strip when no announcement
// is active, so its navbar stays under the same bar. Every other caller gets
// nothing. These tests pin both sides, and that a disabled message never leaks
// back into the strip.

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnnouncementBanner } from '~/components/UIUC-Components/AnnouncementBanner'
import type { AnnouncementBanner as AnnouncementBannerValue } from '~/utils/platformSettings.schema'

const ENV_KEYS = [
  'NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG',
  'NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT',
] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  // Legacy fallback is off unless a test opts in, so "no message" is observable.
  process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'true'
  delete process.env.NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

const DISABLED: AnnouncementBannerValue = {
  enabled: false,
  message: 'Old outage notice',
  linkText: 'Details',
  linkUrl: 'https://status.example.com',
}

const ENABLED: AnnouncementBannerValue = {
  enabled: true,
  message: 'Downtime Saturday 8pm.',
  linkText: '',
  linkUrl: '',
}

describe('AnnouncementBanner with preserveEmptySpace (splash)', () => {
  it('renders an empty, hidden orange strip when disabled', () => {
    const { container } = render(
      <AnnouncementBanner banner={DISABLED} preserveEmptySpace />,
    )

    const strip = container.firstElementChild as HTMLElement
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    // Same padding as the active bar. jsdom drops `var(...)` colours, so the
    // orange itself is only checked in the browser.
    expect(strip).toHaveClass('py-2')
    expect(strip).toBeEmptyDOMElement()
  })

  it('never shows text from a disabled banner, even in the strip', () => {
    render(<AnnouncementBanner banner={DISABLED} preserveEmptySpace />)

    expect(screen.queryByText('Old outage notice')).not.toBeInTheDocument()
    expect(screen.queryByText('Details')).not.toBeInTheDocument()
    expect(screen.queryByText(/rebranded/)).not.toBeInTheDocument()
  })

  it('renders the strip with no landmark when there is no banner at all', () => {
    const { container } = render(
      <AnnouncementBanner banner={null} preserveEmptySpace />,
    )

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
  })

  it('renders the active message in a labelled landmark, not the strip', () => {
    const { container } = render(
      <AnnouncementBanner banner={ENABLED} preserveEmptySpace />,
    )

    expect(
      screen.getByRole('region', { name: 'Site announcement' }),
    ).toHaveTextContent('Downtime Saturday 8pm.')
    expect(container.firstElementChild).not.toHaveAttribute('aria-hidden')
  })

  it('still shows the home-only legacy fallback over the strip when it applies', () => {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'false'

    render(
      <AnnouncementBanner banner={null} legacyFallback preserveEmptySpace />,
    )

    expect(
      screen.getByRole('region', { name: 'Site announcement' }),
    ).toHaveTextContent(/rebranded to Illinois Chat/)
  })
})

describe('AnnouncementBanner without preserveEmptySpace (application pages)', () => {
  it('renders nothing when disabled, so no bar and no space', () => {
    const { container } = render(<AnnouncementBanner banner={DISABLED} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no banner and the legacy chain has no content', () => {
    const { container } = render(<AnnouncementBanner banner={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for the admin preview while disabled', () => {
    const { container } = render(
      <AnnouncementBanner banner={DISABLED} preview />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
