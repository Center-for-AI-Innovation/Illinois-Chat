import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../card'

describe('Card', () => {
  it('matches the Figma card', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="header">
          <CardTitle>Default Model</CardTitle>
          <CardDescription>Choose the default model.</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    )

    const card = screen.getByTestId('card')
    expect(card).toHaveClass(
      'rounded-xl',
      'border',
      'border-border',
      'bg-card',
      'shadow-sm',
    )
    expect(card).not.toHaveClass('ring-1')
    expect(screen.getByTestId('header')).toHaveClass('gap-1.5')
    expect(screen.getByText('Default Model')).toHaveClass(
      'text-base',
      'font-semibold',
      'leading-none',
    )
    expect(screen.getByText('Choose the default model.')).toHaveClass(
      'text-sm',
      'text-(--foreground-subtle)',
    )
  })
})
