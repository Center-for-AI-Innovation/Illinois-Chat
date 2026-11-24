import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '../input'
import { Label } from '../label'

describe('Input', () => {
  it('matches the Figma default input', () => {
    render(<Input aria-label="Email" placeholder="Placeholder" />)

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveClass(
      'h-9',
      'px-3',
      'rounded-md',
      'border-input',
      'bg-background',
      'shadow-xs',
      'placeholder:text-muted-foreground',
      'focus-visible:ring-[3px]',
    )
  })

  // Figma: an error shows a red border at rest and only adds the red ring on focus.
  it('only rings an invalid input while focused', () => {
    render(<Input aria-label="Email" aria-invalid />)

    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveClass(
      'aria-[invalid]:border-destructive',
      'aria-[invalid]:focus-visible:ring-destructive/20',
    )
    expect(input).not.toHaveClass('aria-[invalid]:ring-[3px]')
  })

  it('is labelled by an associated Label', () => {
    render(
      <>
        <Label htmlFor="base-url">Base URL</Label>
        <Input id="base-url" />
      </>,
    )

    expect(
      screen.getByRole('textbox', { name: 'Base URL' }),
    ).toBeInTheDocument()
  })
})
