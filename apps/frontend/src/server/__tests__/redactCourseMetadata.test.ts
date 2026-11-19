import { describe, expect, it } from 'vitest'
import { redactCourseMetadataFor } from '../redactCourseMetadata'
import type { AuthenticatedUser } from '~/proxy'
import type { CourseMetadata } from '~/types/courseMetadata'

const user = (email: string) => ({ email }) as AuthenticatedUser
const meta = (over: Partial<CourseMetadata> = {}) =>
  ({
    course_owner: 'owner@illinois.edu',
    course_admins: ['admin@illinois.edu', 'other-admin@illinois.edu'],
    approved_emails_list: ['member@illinois.edu', 'other@illinois.edu'],
    system_prompt: 'secret prompt',
    openai_api_key: 'sk-secret',
    is_private: true,
    guidedLearning: true,
    ...over,
  }) as CourseMetadata

describe('redactCourseMetadataFor', () => {
  it('returns the full object for the owner', () => {
    const m = meta()
    expect(redactCourseMetadataFor(user('owner@illinois.edu'), m)).toEqual(m)
  })

  it('returns the full object for an admin', () => {
    const m = meta()
    expect(redactCourseMetadataFor(user('admin@illinois.edu'), m)).toEqual(m)
  })

  it('strips secrets and keeps only the approved caller email', () => {
    const out = redactCourseMetadataFor(user('member@illinois.edu'), meta())
    expect('openai_api_key' in out).toBe(false)
    expect('system_prompt' in out).toBe(false)
    expect(out.approved_emails_list).toEqual(['member@illinois.edu'])
    expect(out.course_admins).toEqual([])
    expect(out.guidedLearning).toBe(true)
    expect(out.course_owner).toBe('owner@illinois.edu')
  })

  it('empties the lists for a logged-in user with no role', () => {
    const out = redactCourseMetadataFor(
      user('stranger@illinois.edu'),
      meta({ is_private: false }),
    )
    expect('system_prompt' in out).toBe(false)
    expect(out.course_admins).toEqual([])
    expect(out.approved_emails_list).toEqual([])
  })

  it('redacts for anonymous callers', () => {
    const out = redactCourseMetadataFor(undefined, meta())
    expect('system_prompt' in out).toBe(false)
    expect('openai_api_key' in out).toBe(false)
    expect(out.course_admins).toEqual([])
    expect(out.approved_emails_list).toEqual([])
  })

  it('does not mutate the input', () => {
    const m = meta()
    redactCourseMetadataFor(undefined, m)
    expect(m.system_prompt).toBe('secret prompt')
    expect(m.course_admins).toHaveLength(2)
  })
})
