import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '~/test-utils/renderWithProviders'

vi.mock('~/utils/apiUtils', async (importOriginal) => {
  const original = await importOriginal<any>()
  return {
    ...original,
    callSetCourseMetadata: vi.fn(async () => true),
  }
})

// The env allowlist is empty in tests, so it has to be stubbed for the
// re-injection assertions below to mean anything.
vi.mock('~/utils/superAdmins', () => ({
  superAdmins: ['platform@illinois.edu'],
  isSuperAdmin: (email?: string | null) =>
    email?.toLowerCase() === 'platform@illinois.edu',
}))

import { callSetCourseMetadata } from '~/utils/apiUtils'
import EmailListAccordion from '../EmailListAccordion'

describe('EmailListAccordion', () => {
  it('returns null for public member lists', () => {
    const { container } = renderWithProviders(
      <EmailListAccordion
        course_name="CS101"
        metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: [],
            approved_emails_list: [],
          } as any
        }
        is_private={false}
        is_for_admins={false}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('adds, validates, pastes, and deletes member emails', async () => {
    const user = userEvent.setup()
    const onEmailAddressesChange = vi.fn()

    renderWithProviders(
      <EmailListAccordion
        course_name="CS101"
        metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: ['admin@example.com'],
            approved_emails_list: ['a@example.com'],
          } as any
        }
        is_private
        is_for_admins={false}
        onEmailAddressesChange={onEmailAddressesChange}
      />,
    )

    const input = screen.getByPlaceholderText(/Add people by email/i)

    await user.type(input, 'not-an-email')
    await user.keyboard('{Enter}')
    expect(
      await screen.findByText(/not-an-email is not a valid email address/i),
    ).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'b@example.com')
    await user.keyboard('{Enter}')

    expect(callSetCourseMetadata).toHaveBeenCalled()
    expect(onEmailAddressesChange).toHaveBeenCalled()

    // Paste multiple emails (should de-dupe existing a@example.com)
    await user.clear(input)
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => 'a@example.com c@example.com',
      },
    })
    expect(callSetCourseMetadata).toHaveBeenCalled()

    // Delete an email row
    await user.click(
      screen.getByRole('button', { name: /Remove a@example.com/i }),
    )
    expect(callSetCourseMetadata).toHaveBeenCalled()
  })

  it('hides baked-in platform admins from the project admin list', async () => {
    renderWithProviders(
      <EmailListAccordion
        course_name="CS101"
        metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: ['admin1@example.com', 'platform@illinois.edu'],
          } as any
        }
        is_private={false}
        is_for_admins
      />,
    )

    expect(await screen.findByText('admin1@example.com')).toBeInTheDocument()
    // Entries left over from the old seeding behaviour are display-filtered,
    // since they represent a platform role rather than a project role.
    expect(screen.queryByText('platform@illinois.edu')).not.toBeInTheDocument()
  })

  it('removes only the requested admin, leaving existing entries alone', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EmailListAccordion
        course_name="CS101"
        metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: ['admin1@example.com', 'admin2@example.com'],
          } as any
        }
        is_private={false}
        is_for_admins
      />,
    )

    await user.click(
      await screen.findByRole('button', { name: /Remove admin1@example.com/i }),
    )

    expect(callSetCourseMetadata).toHaveBeenCalledWith('CS101', {
      course_owner: 'owner@example.com',
      course_admins: ['admin2@example.com'],
    })
  })

  it('does not re-inject platform admins when an admin is removed', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EmailListAccordion
        course_name="CS101"
        metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: ['admin1@example.com'],
          } as any
        }
        is_private={false}
        is_for_admins
      />,
    )

    await user.click(
      await screen.findByRole('button', { name: /Remove admin1@example.com/i }),
    )

    // This used to strip the allowlist and immediately re-add it, so every
    // edit re-seeded platform admins into project membership and a revoked
    // grant left project access behind.
    const [, written] = (callSetCourseMetadata as any).mock.calls.at(-1)
    expect(written.course_admins).toEqual([])
  })

  it('does not re-inject platform admins when an admin is added', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EmailListAccordion
        course_name="CS101"
        metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: [],
          } as any
        }
        is_private={false}
        is_for_admins
      />,
    )

    const input = await screen.findByPlaceholderText(/Add people by email/i)
    await user.type(input, 'admin2@example.com')
    await user.keyboard('{Enter}')

    const [, written] = (callSetCourseMetadata as any).mock.calls.at(-1)
    expect(written.course_admins).toEqual(['admin2@example.com'])
  })

  it('lets a previously-seeded platform admin be removed for real', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <EmailListAccordion
        course_name="CS101"
        metadata={
          {
            course_owner: 'owner@example.com',
            course_admins: ['platform@illinois.edu', 'admin1@example.com'],
          } as any
        }
        is_private={false}
        is_for_admins
      />,
    )

    await user.click(
      await screen.findByRole('button', { name: /Remove admin1@example.com/i }),
    )

    // The stale entry is not re-added by the write path either — it survives
    // only because nothing cleans it up, not because the code puts it back.
    const [, written] = (callSetCourseMetadata as any).mock.calls.at(-1)
    expect(written.course_admins).toEqual(['platform@illinois.edu'])
  })
})
