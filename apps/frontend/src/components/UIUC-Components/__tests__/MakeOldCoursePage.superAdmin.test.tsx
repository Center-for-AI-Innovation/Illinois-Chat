import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CourseMetadata } from '~/types/courseMetadata'
import MakeOldCoursePage from '../MakeOldCoursePage'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('~/components/Layout/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  getInitialCollapsedState: () => false,
}))
vi.mock('../UploadCard', () => ({
  UploadCard: () => <div>Upload documents</div>,
}))
vi.mock('../DocumentGroupsCard', () => ({ default: () => null }))
vi.mock('../DocumentsCard', () => ({ default: () => null }))
vi.mock('../GlobalFooter', () => ({ default: () => null }))
vi.mock('../CannotEditCourse', () => ({
  CannotEditCourse: () => <div>Access denied</div>,
}))

describe('dashboard admin access', () => {
  const metadata = {
    course_owner: 'owner@example.com',
    course_admins: [],
    is_private: true,
  } as CourseMetadata

  it('admits a super admin who is not stored in the project admin list', () => {
    replace.mockClear()
    render(
      <MakeOldCoursePage
        course_name="private-project"
        metadata={metadata}
        current_email="operator@example.com"
        isSuperAdmin
      />,
    )
    expect(screen.getByText('Upload documents')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('continues to deny someone with neither project nor platform admin rights', () => {
    render(
      <MakeOldCoursePage
        course_name="private-project"
        metadata={metadata}
        current_email="stranger@example.com"
      />,
    )
    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith('/private-project/not_authorized')
  })
})
