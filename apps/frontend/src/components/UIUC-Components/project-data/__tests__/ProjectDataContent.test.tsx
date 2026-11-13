import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../DocumentUploadSection', () => ({
  DocumentUploadSection: ({ courseMetadata }: { courseMetadata?: unknown }) => (
    <div data-testid="upload-section">
      {courseMetadata ? 'dropzone' : 'skeleton'}
    </div>
  ),
}))

vi.mock('../../UploadNotification', () => ({ default: () => null }))

import { ProjectDataContent } from '../ProjectDataContent'
import { PROJECT_DATA_SECTIONS } from '../project-data.sections'

describe('ProjectDataContent', () => {
  it('renders the header and one heading per section', () => {
    render(<ProjectDataContent projectName="CS101" />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Project Data' }),
    ).toBeInTheDocument()
    for (const s of PROJECT_DATA_SECTIONS) {
      const h = screen.getByRole('heading', { level: 2, name: s.title })
      expect(h).toHaveAttribute('id', s.id)
    }
  })

  it('renders the upload section inside the document-upload section', () => {
    render(<ProjectDataContent projectName="CS101" />)
    const section = screen
      .getByRole('heading', { level: 2, name: 'Document Upload' })
      .closest('section')
    expect(section).toContainElement(screen.getByTestId('upload-section'))
  })
})
