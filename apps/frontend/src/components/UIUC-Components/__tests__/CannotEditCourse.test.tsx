import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CannotEditCourse } from '../CannotEditCourse'

describe('CannotEditCourse', () => {
  it('shows the revised copy and links', () => {
    render(<CannotEditCourse course_name="my-bot" />)

    expect(
      screen.getByRole('heading', {
        name: "You don't have permission to manage this chatbot",
      }),
    ).toBeTruthy()
    expect(
      screen.getByText(/Only the chatbot's owner and admins can open/),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Go to chatbot' }).getAttribute('href'),
    ).toBe('/my-bot/chat')
    expect(
      screen
        .getByRole('link', { name: 'Create your own chatbot' })
        .getAttribute('href'),
    ).toBe('/new')
    expect(document.getElementById('main-content')).toBeTruthy()
  })
})
