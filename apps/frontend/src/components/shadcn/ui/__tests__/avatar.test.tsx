import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar, AvatarFallback } from '../avatar'

describe('Avatar', () => {
  it('is a round muted 32px avatar by default', () => {
    render(
      <Avatar data-testid="avatar">
        <AvatarFallback>TU</AvatarFallback>
      </Avatar>,
    )

    const avatar = screen.getByTestId('avatar')
    expect(avatar).toHaveAttribute('data-shape', 'circle')
    expect(avatar).toHaveAttribute('data-size', 'default')
    expect(avatar).toHaveClass('size-8', 'rounded-full', 'bg-muted')
  })

  it('supports the square shape and the xs/xl sizes', () => {
    render(
      <>
        <Avatar data-testid="square" shape="square">
          <AvatarFallback>SQ</AvatarFallback>
        </Avatar>
        <Avatar data-testid="xs" size="xs" />
        <Avatar data-testid="xl" size="xl" />
      </>,
    )

    expect(screen.getByTestId('square')).toHaveAttribute('data-shape', 'square')
    expect(screen.getByTestId('square')).toHaveClass(
      'data-[shape=square]:rounded-lg',
    )
    expect(screen.getByTestId('xs')).toHaveClass('data-[size=xs]:size-5')
    expect(screen.getByTestId('xl')).toHaveClass('data-[size=xl]:size-12')
  })

  it('uses the foreground colour on the fallback', () => {
    render(
      <Avatar>
        <AvatarFallback>TU</AvatarFallback>
      </Avatar>,
    )

    expect(screen.getByText('TU')).toHaveClass('bg-muted', 'text-foreground')
  })
})
