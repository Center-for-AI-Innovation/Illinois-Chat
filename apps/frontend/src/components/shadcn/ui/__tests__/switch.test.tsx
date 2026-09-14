import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from '../switch'

describe('Switch', () => {
  it('renders the on state when checked', () => {
    render(<Switch showThumbIcon checked aria-label="Toggle" />)

    const toggle = screen.getByRole('switch', { name: 'Toggle' })
    expect(toggle).toHaveAttribute('data-checked')
    expect(toggle.querySelector('.tabler-icon-check')).not.toBeNull()
  })

  // Regression: a `checked` that starts out undefined used to latch Base UI
  // into uncontrolled mode, so the track stayed off forever while the thumb
  // icon and ON/OFF labels showed the real value.
  it('reflects a checked value that only arrives after the first render', () => {
    const { rerender } = render(
      <Switch showThumbIcon checked={undefined} aria-label="Toggle" />,
    )

    rerender(<Switch showThumbIcon checked aria-label="Toggle" />)

    const toggle = screen.getByRole('switch', { name: 'Toggle' })
    expect(toggle).toHaveAttribute('data-checked')
    expect(toggle.querySelector('.tabler-icon-check')).not.toBeNull()
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
})
