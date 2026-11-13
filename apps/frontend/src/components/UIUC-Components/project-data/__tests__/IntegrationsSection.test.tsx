import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createTestQueryClient } from '~/test-utils/renderWithProviders'
import { IntegrationsSection } from '../IntegrationsSection'

vi.mock('../../CanvasIngestForm', () => ({
  default: () => <div>canvas-form</div>,
}))
vi.mock('../../WebsiteIngestForm', () => ({
  default: () => <div>website-form</div>,
}))
vi.mock('../../GitHubIngestForm', () => ({
  default: () => <div>github-form</div>,
}))
vi.mock('../../MITIngestForm', () => ({ default: () => <div>mit-form</div> }))
vi.mock('../../CourseraIngestForm', () => ({
  default: () => <div>coursera-form</div>,
}))

function renderSection() {
  return render(
    <IntegrationsSection
      projectName="CS101"
      uploadFiles={[]}
      setUploadFiles={vi.fn()}
      queryClient={createTestQueryClient()}
    />,
  )
}

describe('IntegrationsSection', () => {
  it('renders all five integrations', () => {
    renderSection()
    for (const name of ['canvas', 'website', 'github', 'mit', 'coursera']) {
      expect(screen.getByText(`${name}-form`)).toBeInTheDocument()
    }
  })

  it('defaults to the horizontally scrolling gallery', () => {
    renderSection()
    const list = screen.getByTestId('integrations-list')
    expect(list).toHaveAttribute('data-layout', 'gallery')
    expect(list).toHaveClass('overflow-x-auto')
    expect(
      screen.getByRole('button', { name: 'Gallery view' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps a selection when the active toggle is clicked again', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByRole('button', { name: 'Gallery view' }))
    expect(screen.getByTestId('integrations-list')).toHaveAttribute(
      'data-layout',
      'gallery',
    )
    expect(
      screen.getByRole('button', { name: 'Gallery view' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches to a three-column grid and back', async () => {
    const user = userEvent.setup()
    renderSection()
    const list = screen.getByTestId('integrations-list')

    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    expect(list).toHaveAttribute('data-layout', 'grid')
    expect(list).toHaveClass('grid-cols-3')
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Gallery view' }))
    expect(list).toHaveAttribute('data-layout', 'gallery')
    expect(list).toHaveClass('overflow-x-auto')
  })
})
