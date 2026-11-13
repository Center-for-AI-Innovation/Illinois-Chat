import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CourseIsFrozen } from '../CourseIsFrozen'

describe('CourseIsFrozen', () => {
  it('explains the freeze and links to My Chatbots', () => {
    render(<CourseIsFrozen course_name="my-bot" />)

    expect(
      screen.getByRole('heading', { name: 'my-bot is temporarily frozen' }),
    ).toBeTruthy()
    expect(
      screen.getByText(/An administrator has temporarily frozen/),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /My Chatbots/ }).getAttribute('href'),
    ).toBe('/chatbots')
    expect(document.getElementById('main-content')).toBeTruthy()
  })
})
