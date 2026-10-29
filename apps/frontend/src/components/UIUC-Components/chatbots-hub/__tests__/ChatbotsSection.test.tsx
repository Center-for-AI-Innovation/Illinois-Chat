import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { ChatbotsSection } from '../ChatbotsSection'
import type { ChatbotCardData } from '../chatbots.types'

vi.mock('../ChatbotHubCard', () => ({
  ChatbotHubCard: ({ title }: { title: string }) => (
    <div data-testid="card">{title}</div>
  ),
}))

const makeCards = (n: number): ChatbotCardData[] =>
  Array.from({ length: n }, (_, i) => ({
    course_name: `bot-${i + 1}`,
    title: `bot-${i + 1}`,
    description: '',
    owner: 'You',
    collaboratorCount: 0,
  }))

const titles = () => screen.getAllByTestId('card').map((c) => c.textContent)

describe('ChatbotsSection pagination', () => {
  it('shows no controls when there are 5 or fewer cards', () => {
    renderWithProviders(<ChatbotsSection title="Course" cards={makeCards(5)} />)
    expect(screen.getAllByTestId('card')).toHaveLength(5)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the first 5 cards and a range with previous disabled', () => {
    renderWithProviders(
      <ChatbotsSection title="Course" cards={makeCards(12)} />,
    )
    expect(titles()).toEqual(['bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5'])
    expect(screen.getByText('1–5 of 12')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Previous page of Course' }),
    ).toBeDisabled()
  })

  it('pages forward to a partial last page and disables next', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ChatbotsSection title="Course" cards={makeCards(12)} />,
    )
    const next = screen.getByRole('button', { name: 'Next page of Course' })
    await user.click(next)
    expect(titles()).toEqual(['bot-6', 'bot-7', 'bot-8', 'bot-9', 'bot-10'])
    expect(screen.getByText('6–10 of 12')).toBeInTheDocument()
    await user.click(next)
    expect(titles()).toEqual(['bot-11', 'bot-12'])
    expect(screen.getByText('11–12 of 12')).toBeInTheDocument()
    expect(next).toBeDisabled()
  })

  it('pages back', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ChatbotsSection title="Course" cards={makeCards(12)} />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Next page of Course' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Previous page of Course' }),
    )
    expect(screen.getByText('1–5 of 12')).toBeInTheDocument()
  })

  it('clamps the page and hides controls when the list shrinks', async () => {
    const user = userEvent.setup()
    const { rerender } = renderWithProviders(
      <ChatbotsSection title="Course" cards={makeCards(12)} />,
    )
    const next = screen.getByRole('button', { name: 'Next page of Course' })
    await user.click(next)
    await user.click(next)
    rerender(<ChatbotsSection title="Course" cards={makeCards(3)} />)
    expect(titles()).toEqual(['bot-1', 'bot-2', 'bot-3'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('stays on the first page when the list grows back', async () => {
    const user = userEvent.setup()
    const { rerender } = renderWithProviders(
      <ChatbotsSection title="Course" cards={makeCards(12)} />,
    )
    const next = screen.getByRole('button', { name: 'Next page of Course' })
    await user.click(next)
    await user.click(next)
    rerender(<ChatbotsSection title="Course" cards={makeCards(3)} />)
    rerender(<ChatbotsSection title="Course" cards={makeCards(12)} />)
    expect(screen.getByText('1–5 of 12')).toBeInTheDocument()
  })

  it('keeps focus on the pager when an arrow becomes disabled', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ChatbotsSection title="Course" cards={makeCards(12)} />,
    )
    const next = screen.getByRole('button', { name: 'Next page of Course' })
    const prev = screen.getByRole('button', {
      name: 'Previous page of Course',
    })
    await user.click(next)
    expect(next).toHaveFocus()
    await user.click(next)
    expect(prev).toHaveFocus()
    await user.click(prev)
    await user.click(prev)
    expect(next).toHaveFocus()
  })
})
