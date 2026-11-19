import { describe, expect, it } from 'vitest'
import { getCourseRole } from '../authorization'
import type { AuthenticatedUser } from '~/proxy'
import type { CourseMetadata } from '~/types/courseMetadata'

const user = (email: string) => ({ email }) as AuthenticatedUser
const meta = (over: Partial<CourseMetadata> = {}) =>
  ({
    course_owner: 'owner@illinois.edu',
    course_admins: ['admin@illinois.edu'],
    approved_emails_list: ['member@illinois.edu'],
    is_private: true,
    ...over,
  }) as CourseMetadata

describe('getCourseRole', () => {
  it('returns owner for the course owner', () => {
    expect(getCourseRole(user('owner@illinois.edu'), meta())).toBe('owner')
  })

  it('prefers owner when the owner is also listed as admin', () => {
    const m = meta({ course_admins: ['owner@illinois.edu'] })
    expect(getCourseRole(user('owner@illinois.edu'), m)).toBe('owner')
  })

  it('returns admin for a non-owner admin', () => {
    expect(getCourseRole(user('admin@illinois.edu'), meta())).toBe('admin')
  })

  it('returns member for an approved user', () => {
    expect(getCourseRole(user('member@illinois.edu'), meta())).toBe('member')
  })

  it('returns member for any signed-in user when logged-in users are allowed', () => {
    const m = meta({ allow_logged_in_users: true })
    expect(getCourseRole(user('other@illinois.edu'), m)).toBe('member')
  })

  it('returns none for an unrelated user', () => {
    expect(getCourseRole(user('other@illinois.edu'), meta())).toBe('none')
  })
})
