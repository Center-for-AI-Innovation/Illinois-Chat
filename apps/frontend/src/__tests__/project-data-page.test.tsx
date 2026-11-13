import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ThemeProvider } from '~/contexts/ThemeContext'
import ProjectDataPage from '~/pages/[course_name]/project-data'

const metadataState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  calls: [] as unknown[],
}))

vi.mock('~/hooks/queries/useFetchCourseMetadata', () => ({
  useFetchCourseMetadata: (opts: unknown) => {
    metadataState.calls.push(opts)
    return metadataState.value
  },
}))
vi.mock('~/components/UIUC-Components/MainPageBackground', () => ({
  LoadingPlaceholderForAdminPages: () => <div>Loading</div>,
}))
vi.mock('~/components/UIUC-Components/CannotEditGPT4', () => ({
  CannotEditGPT4Page: () => <div>cannot-edit-gpt4</div>,
}))
vi.mock('~/components/UIUC-Components/project-data/ProjectDataContent', () => ({
  ProjectDataContent: () => <div>project-data-body</div>,
}))

function renderPage(courseName: string) {
  globalThis.__TEST_ROUTER__ = {
    isReady: true,
    query: { course_name: courseName },
    pathname: '/[course_name]/project-data',
    asPath: `/${courseName}/project-data`,
  }
  return render(
    <ThemeProvider>
      <ProjectDataPage />
    </ThemeProvider>,
  )
}

describe('project-data page', () => {
  beforeEach(() => {
    metadataState.calls = []
    globalThis.__TEST_AUTH__ = {
      isAuthenticated: true,
      user: { profile: { email: 'owner@example.com' } },
    }
    metadataState.value = {
      data: { course_owner: 'owner@example.com', course_admins: [] },
      isLoading: false,
      isError: false,
    }
  })
  afterEach(() => {
    globalThis.__TEST_AUTH__ = undefined
    globalThis.__TEST_ROUTER__ = undefined
  })

  it('shows CannotEditGPT4Page for special names', () => {
    renderPage('gpt4')
    expect(screen.getByText('cannot-edit-gpt4')).toBeInTheDocument()
    expect(metadataState.calls).toHaveLength(0)
  })

  it('renders the body inside AdminLayout for the owner', () => {
    renderPage('CS101')
    expect(screen.getByText('project-data-body')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Skip to admin content' }),
    ).toBeInTheDocument()
  })

  it('does not run the body (or its hooks) when access is refused', () => {
    globalThis.__TEST_AUTH__ = {
      isAuthenticated: true,
      user: { profile: { email: 'other@example.com' } },
    }
    renderPage('CS101')
    expect(screen.queryByText('project-data-body')).not.toBeInTheDocument()
    // Only AdminLayout's own call (it always passes `enabled`).
    expect(metadataState.calls.every((c) => 'enabled' in (c as object))).toBe(
      true,
    )
  })
})
