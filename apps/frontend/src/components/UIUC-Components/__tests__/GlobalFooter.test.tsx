import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '~/test-utils/renderWithProviders'

vi.mock('../ThemeToggle', () => ({
  ThemeToggle: () => React.createElement('div', { 'data-testid': 'theme-toggle' }),
}))

describe('GlobalFooter', () => {
  it('renders the Apache 2.0 license link for the Illinois Chat repository', async () => {
    const GlobalFooter = (await import('../GlobalFooter')).default

    renderWithProviders(<GlobalFooter />)

    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument()

    const licenseLink = screen.getByRole('link', {
      name: /Apache 2\.0 Licensed/i,
    })

    expect(licenseLink).toHaveAttribute(
      'href',
      'https://github.com/Center-for-AI-Innovation/Illinois-Chat/blob/main/LICENSE',
    )
    expect(screen.getByText(/Illinois Chat code\./i)).toBeInTheDocument()
  })
})
