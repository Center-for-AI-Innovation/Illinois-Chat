import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ user: { profile: { email: 'a@b.edu' } } }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('../../LargeDropzone', () => ({
  default: () => <div data-testid="dropzone" />,
}))

import { DocumentUploadSection } from '../DocumentUploadSection'
import { type CourseMetadata } from '~/types/courseMetadata'

const props = { projectName: 'CS101', uploadFiles: [], setUploadFiles: vi.fn() }

describe('DocumentUploadSection', () => {
  it('renders the dropzone once metadata is available', () => {
    render(
      <DocumentUploadSection
        {...props}
        courseMetadata={{} as CourseMetadata}
      />,
    )
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })

  it('renders no dropzone while metadata is loading', () => {
    render(<DocumentUploadSection {...props} />)
    expect(screen.queryByTestId('dropzone')).not.toBeInTheDocument()
  })
})
