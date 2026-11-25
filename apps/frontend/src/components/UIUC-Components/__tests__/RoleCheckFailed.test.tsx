import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoleCheckFailed } from '../RoleCheckFailed'

describe('RoleCheckFailed', () => {
  it('offers a retry button and a single chat link with the request ref', () => {
    const onRetry = vi.fn()
    render(
      <RoleCheckFailed
        course_name="my-bot"
        onRetry={onRetry}
        requestId="req-123"
      />,
    )

    expect(screen.getByText(/\(ref: req-123\)/)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Go to chatbot' }).getAttribute('href'),
    ).toBe('/my-bot/chat')
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0]!)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
