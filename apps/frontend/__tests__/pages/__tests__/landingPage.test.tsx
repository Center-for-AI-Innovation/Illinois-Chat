import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('~/components/UIUC-Components/GlobalFooter', () => ({
  default: () => <footer data-testid="footer" />,
}))

vi.mock('~/components/UIUC-Components/navbars/Navbar', () => ({
  default: ({ variant }: { variant?: string }) => (
    <header data-testid="header" data-variant={variant ?? 'application'} />
  ),
}))

import Home from '~/pages/index'

describe('Landing page (src/pages/index.tsx)', () => {
  const renderPage = () => render(<Home />)

  it('renders an H1 element for WCAG 2.4.1 compliance', () => {
    renderPage()

    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toBeTruthy()
    expect(h1.textContent).toContain('Create a chatbot')
  })

  it('has a main landmark', () => {
    renderPage()

    expect(screen.getByRole('main')).toBeTruthy()
  })

  it('opts into the splash navbar layout', () => {
    renderPage()

    expect(screen.getByTestId('header')).toHaveAttribute(
      'data-variant',
      'splash',
    )
  })
})
