import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../button'

describe('Button', () => {
  it('renders a button and handles clicks', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<Button onClick={onClick}>Click me</Button>)
    await user.click(screen.getByRole('button', { name: 'Click me' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('defaults to the Figma primary button', () => {
    render(<Button>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'h-9',
      'px-4',
      'rounded-md',
      'bg-primary',
      'text-primary-foreground',
      'shadow-xs',
      'focus-visible:ring-[3px]',
    )
  })

  it.each([
    ['sm', ['h-8', 'px-3', 'text-xs']],
    ['lg', ['h-10', 'px-8']],
    ['icon', ['size-9']],
    ['icon-xs', ['size-5', 'rounded-sm']],
  ] as const)('applies the %s size', (size, classes) => {
    render(<Button size={size}>Go</Button>)

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(...classes)
  })

  it('uses the accent tokens for outline hover and drops the shadow on ghost', () => {
    render(
      <>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Outline' })).toHaveClass(
      'border-input',
      'shadow-xs',
      'hover:bg-accent',
      'hover:border-(--accent-border)',
    )
    expect(screen.getByRole('button', { name: 'Ghost' })).not.toHaveClass(
      'shadow-xs',
    )
  })
})
