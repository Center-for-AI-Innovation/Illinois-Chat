import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../select'

function renderSelect(props: { defaultOpen?: boolean } = {}) {
  return render(
    <Select {...props}>
      <SelectTrigger aria-label="Default model">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>NCSA Hosted</SelectLabel>
          <SelectItem value="llama">Llama 3.1 8b</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>,
  )
}

describe('Select', () => {
  it('matches the Figma trigger', () => {
    renderSelect()

    const trigger = screen.getByRole('combobox', { name: 'Default model' })
    expect(trigger).toHaveClass(
      'data-[size=default]:h-9',
      'px-3',
      'gap-2',
      'rounded-md',
      'border-input',
      'bg-background',
      'shadow-xs',
      'focus-visible:ring-[3px]',
    )
    expect(trigger).not.toHaveClass('aria-[invalid]:ring-[3px]')
  })

  it('renders a bordered menu with a medium-weight group label', async () => {
    renderSelect({ defaultOpen: true })

    const option = await screen.findByRole('option', { name: 'Llama 3.1 8b' })
    expect(option).toHaveClass(
      'rounded-sm',
      'pl-2',
      'pr-8',
      'focus:bg-accent',
      'data-highlighted:bg-accent',
    )
    expect(screen.getByText('NCSA Hosted')).toHaveClass(
      'text-xs',
      'font-medium',
      'text-muted-foreground',
    )
    expect(option.closest('[data-slot=select-content]')).toHaveClass(
      'border',
      'p-1',
      'shadow-md',
    )
  })
})
