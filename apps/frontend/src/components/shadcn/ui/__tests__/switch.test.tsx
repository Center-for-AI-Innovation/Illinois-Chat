import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from '../switch'

describe('Switch', () => {
  it('renders the on state when checked', () => {
    render(<Switch checked aria-label="Toggle" />)

    const toggle = screen.getByRole('switch', { name: 'Toggle' })
    expect(toggle).toHaveAttribute('data-checked')
  })

  // Regression: a `checked` that starts out undefined used to latch Base UI
  // into uncontrolled mode, so the track stayed off forever.
  it('reflects a checked value that only arrives after the first render', () => {
    const { rerender } = render(
      <Switch checked={undefined} aria-label="Toggle" />,
    )

    rerender(<Switch checked aria-label="Toggle" />)

    const toggle = screen.getByRole('switch', { name: 'Toggle' })
    expect(toggle).toHaveAttribute('data-checked')
  })

  it('reports the next value when toggled from an undefined start', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Switch
        checked={undefined}
        onCheckedChange={onCheckedChange}
        aria-label="Toggle"
      />,
    )
    await user.click(screen.getByRole('switch', { name: 'Toggle' }))

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('defaults to the 36x20 Figma track with a 16px thumb', () => {
    render(<Switch checked aria-label="Toggle" />)

    const toggle = screen.getByRole('switch', { name: 'Toggle' })
    expect(toggle).toHaveClass('h-5', 'w-9', 'data-checked:bg-primary')
    expect(toggle.firstElementChild).toHaveClass(
      'size-4',
      'bg-background',
      'data-checked:translate-x-4',
    )
  })

  it('renders no text or icons inside the track', () => {
    render(<Switch checked aria-label="Toggle" />)

    const toggle = screen.getByRole('switch', { name: 'Toggle' })
    expect(toggle).toHaveTextContent('')
    expect(toggle.querySelector('svg')).toBeNull()
  })

  it('keeps explicit legacy sizes', () => {
    render(<Switch size="default" aria-label="Toggle" />)

    expect(screen.getByRole('switch', { name: 'Toggle' })).toHaveClass(
      'h-6',
      'w-12',
    )
  })
})
