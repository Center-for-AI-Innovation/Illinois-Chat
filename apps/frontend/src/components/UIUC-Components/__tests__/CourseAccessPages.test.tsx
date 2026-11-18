import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, screen } from '@testing-library/react'

import { renderWithProviders } from '~/test-utils/renderWithProviders'

vi.mock('../navbars/Navbar', () => ({
  default: () => React.createElement('div', null, 'Navbar'),
}))
vi.mock('../GlobalFooter', () => ({
  default: () => React.createElement('div', null, 'GlobalFooter'),
}))

describe('Course access pages', () => {
  it('CanViewOnlyCourse renders a link to chat and contact emails', async () => {
    const { CanViewOnlyCourse } = await import('../CanViewOnlyCourse')
    renderWithProviders(
      <CanViewOnlyCourse
        course_name="CS101"
        course_metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: ['a@example.com'],
          } as any
        }
      />,
    )

    expect(screen.getByText(/You cannot edit this page/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /uiuc\.chat\/CS101/i }),
    ).toHaveAttribute('href', '/CS101/chat')
    expect(screen.getByText(/owner@example\.com/i)).toBeInTheDocument()
    expect(screen.getByText(/a@example\.com/i)).toBeInTheDocument()
  })

  it('does not mount its own navbar; the shared site header owns it', async () => {
    const { CanViewOnlyCourse } = await import('../CanViewOnlyCourse')
    renderWithProviders(
      <CanViewOnlyCourse
        course_name="CS101"
        course_metadata={
          { course_owner: 'owner@example.com', course_admins: [] } as any
        }
      />,
    )

    expect(screen.queryByText('Navbar')).not.toBeInTheDocument()
  })

  it('keeps GetCurrentPageName, which the LLM and model-toggle forms import', async () => {
    globalThis.__TEST_ROUTER__ = { asPath: '/CS101/llms?tab=models' }
    const { GetCurrentPageName } = await import('../CanViewOnlyCourse')

    const { result } = renderHook(() => GetCurrentPageName())

    expect(result.current).toBe('CS101')
    globalThis.__TEST_ROUTER__ = undefined
  })
})
