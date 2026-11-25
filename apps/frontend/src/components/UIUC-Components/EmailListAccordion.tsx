import { IconUser, IconUsers, IconAt, IconX } from '@tabler/icons-react'
import React, {
  useState,
  useEffect,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { type CourseMetadata } from '~/types/courseMetadata'
import { useUpdateCourseMetadata } from '~/hooks/queries/useUpdateCourseMetadata'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/shadcn/ui/accordion'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { superAdmins } from '~/utils/superAdmins'
function EmailInput({
  value,
  error,
  onKeyDown,
  onChange,
  onPaste,
  disabled = false,
}: {
  value: string
  error: string | null
  onKeyDown: (evt: KeyboardEvent<HTMLInputElement>) => void
  onChange: (evt: ChangeEvent<HTMLInputElement>) => void
  onPaste: (evt: React.ClipboardEvent<HTMLInputElement>) => void
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <IconAt className="h-4 w-4 text-gray-400" />
      </div>
      <input
        type="text"
        placeholder="Add people by email"
        aria-label="Add people by email"
        className={`${montserrat_paragraph.variable} font-montserratParagraph w-full rounded-md border border-(--foreground-faded) bg-(--modal) px-10 py-2.5 text-sm text-(--modal-text) placeholder-(--foreground-faded) transition-all duration-300 focus:border-(--illinois-orange)`}
        value={value}
        onKeyDown={onKeyDown}
        onChange={onChange}
        onPaste={onPaste}
        disabled={disabled}
      />
      {error && (
        <p
          className={`${montserrat_paragraph.variable} font-montserratParagraph mt-1 text-sm text-[-error]`}
        >
          {error}
        </p>
      )}
    </div>
  )
}

function EmailListItem({
  email,
  onDelete,
  course_owner,
  course_admins,
}: {
  email: string
  onDelete: () => void
  course_owner: string
  course_admins: string[]
}) {
  const isAdmin = email === course_owner || course_admins.includes(email)

  return (
    <div className="group flex items-center justify-between rounded-lg bg-(--modal) px-4 py-3 transition-all duration-300">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--background-faded)">
          {isAdmin ? (
            <IconUsers className="h-5 w-5 text-(--modal-text)" />
          ) : (
            <IconUser className="h-5 w-5 text-(--modal-text)" />
          )}
        </div>
        <div className="flex flex-col">
          <span
            className={`${montserrat_paragraph.variable} font-montserratParagraph text-sm`}
          >
            {email}
          </span>
          <span
            className={`${montserrat_paragraph.variable} font-montserratParagraph text-xs`}
          >
            Can {isAdmin ? 'manage' : 'view'}
          </span>
        </div>
      </div>

      <button
        onClick={onDelete}
        aria-label={`Remove ${email}`}
        className="rounded-full p-1.5 opacity-0 transition-all duration-300 group-hover:opacity-100 hover:bg-(--background-faded) focus-visible:opacity-100"
      >
        <IconX className="h-4 w-4 text-(--foreground) transition-colors" />
      </button>
    </div>
  )
}

function EmailListAccordion({
  course_name,
  metadata,
  is_private,
  onSaved,
  is_for_admins,
  disabled = false,
}: {
  course_name: string
  metadata: CourseMetadata
  is_private: boolean
  /** Called after a list save succeeds. */
  onSaved?: () => void
  is_for_admins: boolean
  /** Blocks edits, e.g. while the parent still shows a possibly stale copy. */
  disabled?: boolean
}) {
  // Saves update the shared metadata cache right away and roll back if the
  // save fails; the parent re-renders from that cache.
  const { save } = useUpdateCourseMetadata(course_name)
  const emailAddresses = metadata.approved_emails_list || []
  const courseAdmins = metadata.course_admins || []
  const [value, setValue] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // The one field this accordion edits. Saves send only this field; the
  // server merges it over the stored metadata.
  const listChange = (updated: CourseMetadata) =>
    is_for_admins
      ? { course_admins: updated.course_admins }
      : { approved_emails_list: updated.approved_emails_list }

  const saveList = async (updated: CourseMetadata) => {
    const ok = await save(listChange(updated))
    if (ok) onSaved?.()
    return ok
  }

  const handleDelete = async (email_address: string) => {
    if (isUpdating || disabled) return
    setIsUpdating(true)

    try {
      let updatedMetadata: CourseMetadata

      if (is_for_admins) {
        // Removes only the requested address. This used to strip the
        // super-admin allowlist and immediately re-add it, which meant the
        // browser re-seeded platform admins into `course_admins` on every
        // edit and deleting one was a silent no-op. Super admins now get
        // project access from a live check on the server, so this list holds
        // project roles and nothing else. Pre-existing baked-in entries are
        // left as they are — no cleanup — which is why the render below still
        // filters them out of the display.
        const updatedCourseAdmins = courseAdmins.filter(
          (admin) => admin !== email_address,
        )

        updatedMetadata = {
          ...metadata,
          course_admins: updatedCourseAdmins,
        }
      } else {
        const updatedEmailAddresses = emailAddresses.filter(
          (email) => email !== email_address,
        )

        updatedMetadata = {
          ...metadata,
          approved_emails_list: updatedEmailAddresses,
        }
      }

      // Send only the edited list so a stale copy of the rest of the metadata
      // can't overwrite newer values on the server.
      await saveList(updatedMetadata)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleKeyDown = async (evt: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (['Enter', 'Tab', ','].includes(evt.key)) {
      evt.preventDefault()
      const trimmedValue = value.trim()

      if (trimmedValue && isValid(trimmedValue)) {
        let updatedMetadata: CourseMetadata

        if (is_for_admins) {
          updatedMetadata = {
            ...metadata,
            course_admins: [...new Set([...courseAdmins, trimmedValue])],
          }
        } else {
          const updatedEmailAddresses = [...emailAddresses, trimmedValue]

          updatedMetadata = {
            ...metadata,
            approved_emails_list: updatedEmailAddresses,
          }
        }

        // Send only the edited list. Keep the typed address if it failed.
        if (await saveList(updatedMetadata)) setValue('')
      }
    }
  }

  const handleChange = (evt: ChangeEvent<HTMLInputElement>) => {
    setValue(evt.target.value)
    setError(null)
  }

  const handlePaste = async (evt: React.ClipboardEvent<HTMLInputElement>) => {
    const paste = evt.clipboardData.getData('text')
    if (!paste || disabled) return // Let browser handle paste if clipboard data is unavailable
    evt.preventDefault()
    const emails = paste.match(/[\w\d\.-]+@[\w\d\.-]+\.[\w\d\.-]+/g)

    if (emails) {
      const toBeAdded = emails.filter((email: string) => !isInList(email))
      if (is_for_admins) {
        const updatedMetadata = {
          ...metadata,
          course_admins: [...new Set([...courseAdmins, ...toBeAdded])],
        }

        await saveList(updatedMetadata)
      } else {
        const updatedEmailAddresses = [...emailAddresses, ...toBeAdded]

        const updatedMetadata = {
          ...metadata,
          approved_emails_list: updatedEmailAddresses,
        }

        await saveList(updatedMetadata)
      }
    }
  }

  const isValid = (email: string) => {
    let localError = null

    if (isInList(email)) {
      localError = `${email} has already been added.`
    }

    if (!isEmail(email)) {
      localError = `${email} is not a valid email address.`
    }

    if (localError) {
      setError(localError)
      return false
    }

    return true
  }

  const isInList = (item: string) => {
    return emailAddresses.includes(item)
  }

  const isEmail = (email: string) => {
    return /[\w\d\.-]+@[\w\d\.-]+\.[\w\d\.-]+/.test(email)
  }

  if (is_for_admins) {
    return (
      <div className="w-full rounded-lg bg-(--background-faded)">
        <Accordion
          className="w-full"
          defaultValue={!is_private ? ['admins'] : undefined}
        >
          <AccordionItem value="admins" className="border-none">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--modal)">
                  <IconUsers className="h-5 w-5 text-(--foreground-faded)" />
                </div>
                <div className="flex flex-col items-start">
                  <span
                    className={`${montserrat_heading.variable} font-montserratHeading text-sm`}
                  >
                    Administrators
                  </span>
                  <span
                    className={`${montserrat_paragraph.variable} font-montserratParagraph text-xs`}
                  >
                    Admins have full edit permissions
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 px-4 py-3">
                <EmailInput
                  value={value}
                  error={error}
                  onKeyDown={handleKeyDown}
                  onChange={handleChange}
                  onPaste={handlePaste}
                  disabled={disabled}
                />
                {courseAdmins.filter((email) => !superAdmins.includes(email))
                  .length > 0 && (
                  <div className="space-y-2">
                    {courseAdmins
                      .filter((email) => !superAdmins.includes(email))
                      .map((email) => (
                        <EmailListItem
                          key={email}
                          email={email}
                          onDelete={() => handleDelete(email)}
                          course_owner={metadata.course_owner}
                          course_admins={courseAdmins}
                        />
                      ))}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    )
  }

  if (!is_private && !is_for_admins) return null

  return (
    <div className="w-full rounded-lg bg-(--background-faded)">
      <Accordion
        className="w-full"
        defaultValue={is_private ? ['members'] : undefined}
      >
        <AccordionItem value="members" className="border-none">
          <AccordionTrigger className="px-4 py-3 text-(--modal-text) hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--modal)">
                <IconUsers className="h-5 w-5 text-(--foreground-faded)" />
              </div>
              <div className="flex flex-col items-start">
                <span
                  className={`${montserrat_heading.variable} font-montserratHeading text-sm`}
                >
                  Members
                </span>
                <span
                  className={`${montserrat_paragraph.variable} font-montserratParagraph text-xs`}
                >
                  Only these email addresses can access the content
                </span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 px-4 py-3">
              <EmailInput
                value={value}
                error={error}
                onKeyDown={handleKeyDown}
                onChange={handleChange}
                onPaste={handlePaste}
                disabled={disabled}
              />
              {emailAddresses.length > 0 && (
                <div className="space-y-2">
                  {emailAddresses.map((email) => (
                    <EmailListItem
                      key={email}
                      email={email}
                      onDelete={() => handleDelete(email)}
                      course_owner={metadata.course_owner}
                      course_admins={courseAdmins}
                    />
                  ))}
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

export default EmailListAccordion
