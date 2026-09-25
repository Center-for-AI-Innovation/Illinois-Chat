import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from '../combobox'

interface Fruit {
  value: string
  label: string
}

const fruits: Fruit[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
]

function SingleSelectExample({
  onValueChange,
}: {
  onValueChange?: (value: Fruit | null) => void
}) {
  return (
    <Combobox items={fruits} onValueChange={onValueChange}>
      <ComboboxInputGroup>
        <ComboboxInput aria-label="Fruit" placeholder="Choose a fruit" />
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>No fruits found.</ComboboxEmpty>
        <ComboboxList>
          {(item: Fruit) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function MultiSelectExample({
  onValueChange,
}: {
  onValueChange?: (value: Fruit[]) => void
}) {
  return (
    <Combobox items={fruits} multiple onValueChange={onValueChange}>
      <ComboboxInputGroup>
        <ComboboxChips>
          <ComboboxValue>
            {(value: Fruit[]) => (
              <>
                {value.map((fruit) => (
                  <ComboboxChip key={fruit.value} aria-label={fruit.label}>
                    {fruit.label}
                    <ComboboxChipRemove
                      aria-label={`Remove ${fruit.label}`}
                    />
                  </ComboboxChip>
                ))}
                <ComboboxInput aria-label="Fruits" />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>No fruits found.</ComboboxEmpty>
        <ComboboxList>
          {(item: Fruit) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

describe('shadcn combobox', () => {
  it('opens on focus, filters items while typing, and selects one', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<SingleSelectExample onValueChange={onValueChange} />)

    const input = screen.getByLabelText('Fruit')
    await user.click(input)

    expect(await screen.findByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Banana')).toBeInTheDocument()
    expect(screen.getByText('Cherry')).toBeInTheDocument()

    await user.type(input, 'ban')

    await waitFor(() => {
      expect(screen.queryByText('Apple')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Banana')).toBeInTheDocument()

    await user.click(screen.getByText('Banana'))

    expect(onValueChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'banana' }),
      expect.anything(),
    )
  })

  it('shows the empty state when no items match', async () => {
    const user = userEvent.setup()
    render(<SingleSelectExample />)

    const input = screen.getByLabelText('Fruit')
    await user.click(input)
    await user.type(input, 'zzz')

    expect(await screen.findByText('No fruits found.')).toBeInTheDocument()
  })

  it('supports multiple selection with removable chips', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<MultiSelectExample onValueChange={onValueChange} />)

    const input = screen.getByLabelText('Fruits')
    await user.click(input)
    await user.click(await screen.findByText('Apple'))

    expect(onValueChange).toHaveBeenCalledWith(
      [expect.objectContaining({ value: 'apple' })],
      expect.anything(),
    )

    // Re-open and add a second item.
    await user.click(input)
    await user.click(await screen.findByText('Banana'))

    expect(onValueChange).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({ value: 'apple' }),
        expect.objectContaining({ value: 'banana' }),
      ],
      expect.anything(),
    )

    const removeApple = screen.getByLabelText('Remove Apple')
    fireEvent.click(removeApple)

    await waitFor(() => {
      expect(onValueChange).toHaveBeenLastCalledWith(
        [expect.objectContaining({ value: 'banana' })],
        expect.anything(),
      )
    })
  })
})
