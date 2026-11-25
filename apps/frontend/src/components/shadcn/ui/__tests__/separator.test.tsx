import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Separator } from '../separator'

describe('Separator', () => {
  it('draws a 1px border-colored line in both orientations', () => {
    render(
      <>
        <Separator data-testid="horizontal" />
        <Separator data-testid="vertical" orientation="vertical" />
      </>,
    )

    for (const id of ['horizontal', 'vertical']) {
      expect(screen.getByTestId(id)).toHaveClass(
        'bg-border',
        'data-[orientation=horizontal]:h-px',
        'data-[orientation=vertical]:w-px',
      )
    }
    expect(screen.getByTestId('vertical')).toHaveAttribute(
      'data-orientation',
      'vertical',
    )
  })
})
