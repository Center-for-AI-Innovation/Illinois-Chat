import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  CountryOfConcernIcon,
  CountryOfConcernNotice,
  DeepSeekDirectiveNotice,
} from '../CountryOfConcern'
import {
  COUNTRY_OF_CONCERN_INFO_URL,
  COUNTRY_OF_CONCERN_WARNING,
} from '~/utils/modelProviders/countriesOfConcern'

describe('CountryOfConcernNotice', () => {
  it('renders the shared warning with the guidance PDF link', () => {
    const { container } = render(<CountryOfConcernNotice />)
    // Exact match guards the split around the link text.
    expect(container.textContent).toBe(COUNTRY_OF_CONCERN_WARNING)
    expect(
      screen.getByRole('link', { name: 'Country of Concern' }),
    ).toHaveAttribute('href', COUNTRY_OF_CONCERN_INFO_URL)
  })
})

describe('DeepSeekDirectiveNotice', () => {
  it('renders the directive notice with the Federal Register link', () => {
    const { container } = render(<DeepSeekDirectiveNotice />)
    expect(container.textContent).toContain(
      'Homeland Security issued a directive ordering federal civilian agencies',
    )
    expect(screen.getByRole('link', { name: 'directive' })).toHaveAttribute(
      'href',
      'https://public-inspection.federalregister.gov/2026-21447.pdf',
    )
  })
})

describe('CountryOfConcernIcon', () => {
  it('renders nothing for an unflagged model', () => {
    const { container } = render(<CountryOfConcernIcon modelId="gpt-4o" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('labels the icon with the country for a flagged model', () => {
    render(<CountryOfConcernIcon modelId="deepseek/deepseek-chat-v3-0324" />)
    expect(
      screen.getByLabelText('Country of concern warning: China'),
    ).toBeInTheDocument()
  })
})
