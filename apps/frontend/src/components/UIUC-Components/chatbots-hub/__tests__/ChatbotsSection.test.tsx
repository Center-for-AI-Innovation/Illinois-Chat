import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { ChatbotsSection } from '../ChatbotsSection'
import type { ChatbotCardData } from '../chatbots.types'

const usePagedChatbotsMock = vi.hoisted(() => vi.fn())
vi.mock('~/hooks/queries/usePagedChatbots', () => ({
  usePagedChatbots: usePagedChatbotsMock,
}))

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

describe('ChatbotsSection remote mode', () => {
  const remotePage = (offset: number, limit: number, total: number) => ({
    data: {
      results: makeCards(total).slice(offset, offset + limit),
      total,
    },
    isError: false,
  })

  afterEach(() => {
    usePagedChatbotsMock.mockReset()
  })

  it('shows the server total and requests the next offset', async () => {
    usePagedChatbotsMock.mockImplementation(({ offset, limit }) =>
      remotePage(offset, limit, 42),
    )
    const user = userEvent.setup()
    renderWithProviders(<ChatbotsSection title="Shared" source="shared" />)
    expect(screen.getByText('1–5 of 42')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Next page of Shared' }),
    )
    expect(usePagedChatbotsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'shared', offset: 5, limit: 5 }),
    )
    expect(titles()).toEqual(['bot-6', 'bot-7', 'bot-8', 'bot-9', 'bot-10'])
  })

  it('shows a spinner on the first load', () => {
    usePagedChatbotsMock.mockReturnValue({ data: undefined, isError: false })
    renderWithProviders(<ChatbotsSection title="Shared" source="shared" />)
    expect(screen.getByRole('heading', { name: 'Shared' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('renders nothing when the section is empty', () => {
    usePagedChatbotsMock.mockReturnValue(remotePage(0, 5, 0))
    const { container } = renderWithProviders(
      <ChatbotsSection title="Shared" source="shared" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an error with retry instead of the empty slot when loading fails', async () => {
    const refetch = vi.fn()
    usePagedChatbotsMock.mockReturnValue({
      data: undefined,
      isError: true,
      refetch,
    })
    const user = userEvent.setup()
    renderWithProviders(
      <ChatbotsSection
        title="Your Bots"
        source="yours"
        empty={<p>No bots yet</p>}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load chatbots.",
    )
    expect(screen.queryByText('No bots yet')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('renders the empty slot when given', () => {
    usePagedChatbotsMock.mockReturnValue(remotePage(0, 5, 0))
    renderWithProviders(
      <ChatbotsSection
        title="Your Bots"
        source="yours"
        empty={<p>No bots yet</p>}
      />,
    )
    expect(screen.getByText('No bots yet')).toBeInTheDocument()
  })
})
