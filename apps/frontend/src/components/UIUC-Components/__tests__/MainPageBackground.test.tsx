import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MainPageBackground } from '~/components/UIUC-Components/MainPageBackground'

vi.mock('~/components/UIUC-Components/navbars/Navbar', () => ({
  default: () => null,
}))
vi.mock('next/router', () => ({ useRouter: () => ({ query: {} }) }))

describe('MainPageBackground', () => {
  it('draws the Illinois wordmark in brand orange, not --primary', () => {
    render(
      <MainPageBackground>
        <p>loading</p>
      </MainPageBackground>,
    )

    const wordmark = screen.getByRole('heading', { level: 1 })
    expect(wordmark.className).toContain('text-(--illinois-orange)')
    expect(wordmark.className).not.toContain('text-(--primary)')
  })
})
