import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SwitchField } from '../switch-field'

describe('SwitchField', () => {
  it('labels the switch and links its description', () => {
    render(
      <SwitchField
        label="Guided Learning"
        description="Walks students through problems."
        checked={false}
      />,
    )

    const toggle = screen.getByRole('switch', { name: 'Guided Learning' })
    expect(toggle).toHaveAccessibleDescription(
      'Walks students through problems.',
    )
  })

  it('toggles exactly once when the label is clicked', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SwitchField
        label="Guided Learning"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    )

    await user.click(screen.getByText('Guided Learning'))

    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('toggles exactly once when the track is clicked', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SwitchField
        label="Guided Learning"
        checked
        onCheckedChange={onCheckedChange}
      />,
    )

    await user.click(screen.getByRole('switch', { name: 'Guided Learning' }))

    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('does not toggle when disabled', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(
      <SwitchField
        label="Guided Learning"
        checked={false}
        disabled
        onCheckedChange={onCheckedChange}
      />,
    )

    await user.click(screen.getByText('Guided Learning'))

    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('applies the box and right-side variants', () => {
    render(
      <SwitchField label="Boxed" type="box" side="right" checked={false} />,
    )

    const field = screen.getByRole('group')
    expect(field).toHaveClass('rounded-lg', 'border', 'p-4', 'flex-row-reverse')
  })
})
