// The banner's whole reason for existing is the three-way distinction between
// "configured and on", "configured and off", and "not configured". The middle
// case is the one that regressed in review: an operator switching the banner
// off must clear the bar, not resurrect the build-time env/rebranding banner.

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnnouncementBanner } from '~/components/UIUC-Components/AnnouncementBanner'

const ENV_KEYS = [
  'NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG',
  'NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT',
] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('AnnouncementBanner', () => {
  it('renders the stored message when enabled', () => {
    render(
      <AnnouncementBanner
        banner={{
          enabled: true,
          message: 'Downtime Saturday 8pm.',
          linkText: '',
          linkUrl: '',
        }}
      />,
    )

    expect(screen.getByText(/Downtime Saturday 8pm/)).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Site announcement' }),
    ).toBeInTheDocument()
  })

  it('renders the optional link alongside the message', () => {
    render(
      <AnnouncementBanner
        banner={{
          enabled: true,
          message: 'Downtime Saturday 8pm.',
          linkText: 'Status page',
          linkUrl: 'https://status.illinois.edu',
        }}
      />,
    )

    const link = screen.getByRole('link', { name: 'Status page' })
    expect(link).toHaveAttribute('href', 'https://status.illinois.edu')
  })

  it('omits the link when only one half of the pair is set', () => {
    render(
      <AnnouncementBanner
        banner={{
          enabled: true,
          message: 'Downtime Saturday 8pm.',
          linkText: 'Status page',
          linkUrl: '',
        }}
      />,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/Downtime Saturday 8pm/)).toBeInTheDocument()
  })

  it('renders nothing at all when explicitly disabled', () => {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'true'
    process.env.NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT =
      '<b>legacy env banner</b>'

    const { container } = render(
      <AnnouncementBanner
        banner={{
          enabled: false,
          message: 'Downtime Saturday 8pm.',
          linkText: '',
          linkUrl: '',
        }}
      />,
    )

    // Not merely hidden: no orange strip in the document, and crucially no
    // fallback to the legacy env banner that is configured right above.
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/legacy env banner/)).not.toBeInTheDocument()
  })

  it('does not fall back to the rebranding notice when disabled', () => {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'false'

    const { container } = render(
      <AnnouncementBanner
        banner={{
          enabled: false,
          message: '',
          linkText: '',
          linkUrl: '',
        }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/rebranded to Illinois Chat/)).not.toBeInTheDocument()
  })

  it('falls back to the legacy env banner when nothing is configured', () => {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'true'
    process.env.NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT =
      '<b>legacy env banner</b>'

    render(<AnnouncementBanner banner={null} />)

    expect(screen.getByText('legacy env banner')).toBeInTheDocument()
  })

  it('falls back to the rebranding notice when the illinois config is off', () => {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'false'
    delete process.env.NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT

    render(<AnnouncementBanner banner={null} />)

    expect(screen.getByText(/rebranded to Illinois Chat/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'chat.illinois.edu' }),
    ).toHaveAttribute('href', 'https://chat.illinois.edu')
  })

  it('renders nothing when the illinois config is on with no env content', () => {
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG = 'true'
    delete process.env.NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT

    const { container } = render(<AnnouncementBanner banner={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('drops the landmark in preview mode so /admin has no duplicate region', () => {
    render(
      <AnnouncementBanner
        preview
        banner={{
          enabled: true,
          message: 'Preview copy.',
          linkText: '',
          linkUrl: '',
        }}
      />,
    )

    expect(screen.getByText('Preview copy.')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Site announcement' }),
    ).not.toBeInTheDocument()
  })
})
