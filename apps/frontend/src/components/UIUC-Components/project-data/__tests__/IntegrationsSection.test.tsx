import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createTestQueryClient } from '~/test-utils/renderWithProviders'
import {
  IntegrationsLayoutToggle,
  IntegrationsSection,
  type IntegrationsLayout,
} from '../IntegrationsSection'

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

// Mirrors ProjectDataContent: the toggle sits in the heading row and the
// layout state lives above both pieces.
function Harness() {
  const [layout, setLayout] = useState<IntegrationsLayout>('gallery')
  return (
    <>
      <IntegrationsLayoutToggle layout={layout} onLayoutChange={setLayout} />
      <IntegrationsSection
        layout={layout}
        projectName="CS101"
        uploadFiles={[]}
        setUploadFiles={vi.fn()}
        queryClient={createTestQueryClient()}
      />
    </>
  )
}

function renderSection() {
  return render(<Harness />)
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
      screen.getByRole('button', { name: 'Gallery View' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps a selection when the active toggle is clicked again', async () => {
    const user = userEvent.setup()
    renderSection()
    const list = screen.getByTestId('integrations-list')

    for (const name of ['Gallery View', 'Grid View']) {
      await user.click(screen.getByRole('button', { name }))
      await user.click(screen.getByRole('button', { name }))
      // Re-clicking must not unpress the widget or change the layout.
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(
        screen
          .getAllByRole('button')
          .filter((b) => b.getAttribute('aria-pressed') === 'true'),
      ).toHaveLength(1)
      expect(list).toHaveAttribute(
        'data-layout',
        name === 'Grid View' ? 'grid' : 'gallery',
      )
    }
  })

  it('switches to a three-column grid and back', async () => {
    const user = userEvent.setup()
    renderSection()
    const list = screen.getByTestId('integrations-list')

    await user.click(screen.getByRole('button', { name: 'Grid View' }))
    expect(list).toHaveAttribute('data-layout', 'grid')
    expect(list).toHaveClass('grid-cols-3')
    expect(screen.getByRole('button', { name: 'Grid View' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Gallery View' }))
    expect(list).toHaveAttribute('data-layout', 'gallery')
    expect(list).toHaveClass('overflow-x-auto')
  })
})
