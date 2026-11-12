import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'

import { GlobalNav } from '../GlobalNav'

expect.extend(toHaveNoViolations)

vi.mock('../AuthMenu', () => ({
  AuthMenu: () => <div data-testid="auth-menu" />,
}))

describe('GlobalNav', () => {
  it('links to the hub and the new-chatbot page, with the auth menu', () => {
    render(<GlobalNav />)

    expect(screen.getByRole('link', { name: 'Chatbots Hub' })).toHaveAttribute(
      'href',
      '/chatbots',
    )
    expect(
      screen.getByRole('link', { name: 'Create Your Own Bot' }),
    ).toHaveAttribute('href', '/new')
    expect(
      screen.getByRole('link', { name: 'Illinois Chat home' }),
    ).toHaveAttribute('href', '/')
    expect(screen.getByTestId('auth-menu')).toBeInTheDocument()
  })

  it('sits in the page flow with a bottom border by default', () => {
    render(<GlobalNav />)
    const header = screen.getByRole('banner')

    expect(header).not.toHaveClass('fixed')
    expect(header).toHaveClass('border-b')
  })

  it('pins to the top of the viewport when fixed', () => {
    render(<GlobalNav position="fixed" />)
    const header = screen.getByRole('banner')

    expect(header).toHaveClass('fixed', 'top-0', 'inset-x-0')
  })

  it('can hide the bottom border', () => {
    render(<GlobalNav position="fixed" hideBorder />)

    expect(screen.getByRole('banner')).not.toHaveClass('border-b')
  })

  it.each(['static', 'fixed'] as const)(
    'has no axe violations when %s',
    async (position) => {
      const { container } = render(<GlobalNav position={position} />)

      expect(await axe(container)).toHaveNoViolations()
    },
  )
})
