import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Alert, AlertDescription, AlertTitle } from '../alert'

describe('Alert', () => {
  it('matches the Figma alert layout', () => {
    render(
      <Alert>
        <svg />
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Details</AlertDescription>
      </Alert>,
    )

    expect(screen.getByRole('alert')).toHaveClass(
      'rounded-lg',
      'border',
      'px-4',
      'py-3',
      'gap-y-1',
      'has-[>svg]:gap-x-3',
      'bg-card',
    )
  })

  it('renders the destructive description at full destructive color', () => {
    render(
      <Alert variant="destructive">
        <AlertDescription>fetch failed</AlertDescription>
      </Alert>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass(
      'text-destructive',
      '*:data-[slot=alert-description]:text-destructive',
    )
    expect(alert).not.toHaveClass(
      '*:data-[slot=alert-description]:text-destructive/90',
    )
  })
})
