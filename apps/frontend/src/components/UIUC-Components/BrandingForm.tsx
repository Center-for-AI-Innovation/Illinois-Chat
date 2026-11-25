import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/shadcn/ui/button'
import { Spinner } from '@/components/shadcn/ui/spinner'
import { Check, AlertCircle } from 'lucide-react'
import { IconFileUpload } from '@tabler/icons-react'

import { FormInput } from '@/components/shadcn/ui/form-input'

import SetExampleQuestions from './SetExampleQuestions'
import ChatbotTagsEditor from './ChatbotTagsEditor'

import { type CourseMetadataOptionalForUpsert } from '~/types/courseMetadata'
import { uploadToS3 } from '~/utils/apiUtils'
import { useCourseMetadata } from '~/hooks/queries/useFetchCourseMetadata'
import { useUpdateCourseMetadata } from '~/hooks/queries/useUpdateCourseMetadata'

const BrandingForm = ({
  project_name,
  user_id,
}: {
  project_name: string
  user_id: string
}) => {
  // Shared metadata query: shows any cached copy at once, refetches on mount,
  // and re-renders when a sibling editor saves.
  const { data: metadata = null } = useCourseMetadata(project_name)
  const { save } = useUpdateCourseMetadata(project_name)

  const [introMessage, setIntroMessage] = useState(
    metadata?.course_intro_message || '',
  )
  const [isIntroMessageUpdated, setIsIntroMessageUpdated] = useState(false)
  const [isSavingGreeting, setIsSavingGreeting] = useState(false)
  // Latest typed text, readable after an await (state would be stale there).
  const introMessageRef = useRef(introMessage)
  introMessageRef.current = introMessage
  const [greetingSaved, setGreetingSaved] = useState(
    !!metadata?.course_intro_message,
  )
  const [logoFileName, setLogoFileName] = useState<string | null>(
    metadata?.banner_image_s3 ? 'Logo uploaded' : null,
  )
  const [logoStatus, setLogoStatus] = useState<
    'idle' | 'uploading' | 'success' | 'error'
  >(metadata?.banner_image_s3 ? 'success' : 'idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Follow the server's greeting, but never replace text the user is still
  // editing or saving (a failed save rolls the cache back, and the typed
  // text must survive that).
  const serverGreeting = metadata?.course_intro_message || ''
  useEffect(() => {
    if (!isIntroMessageUpdated && !isSavingGreeting) {
      setIntroMessage(serverGreeting)
      setGreetingSaved(!!serverGreeting)
    }
    // Only re-sync when the server value changes, not when editing stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverGreeting])

  // Show an existing logo once the metadata arrives.
  const serverLogo = metadata?.banner_image_s3
  useEffect(() => {
    if (serverLogo && logoStatus === 'idle') {
      setLogoFileName('Logo uploaded')
      setLogoStatus('success')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLogo])

  const onUploadLogo = async (logo: File | null) => {
    if (!logo) return

    setLogoFileName(logo.name)
    setLogoStatus('uploading')

    const banner_s3_image = await uploadToS3(logo, user_id, project_name)

    if (banner_s3_image && metadata) {
      // Save the logo on its own. The mutation merges it into the latest
      // cached copy, so data fetched during the upload is kept.
      const saved = await save({ banner_image_s3: banner_s3_image })
      setLogoStatus(saved ? 'success' : 'error')
    } else {
      setLogoStatus('error')
    }
  }

  return (
    <>
      <div className="branding_form">
        <div className="set_greeting relative flex flex-col">
          <div className="mb-3 font-semibold">Greeting</div>

          <div className="flex flex-col gap-2">
            <FormInput
              as="textarea"
              minRows={2}
              maxRows={5}
              placeholder="Enter a greeting to help users get started with your bot, shown before they start chatting."
              aria-label="Greeting"
              className="w-full"
              value={introMessage}
              rightSlot={
                greetingSaved && !isIntroMessageUpdated ? (
                  <Check className="size-4 text-(--illinois-prairie)" />
                ) : null
              }
              onChange={(e) => {
                setIntroMessage(e.target.value)
                setIsIntroMessageUpdated(true)
                setGreetingSaved(false)
              }}
            />

            <div>
              <Button
                type="submit"
                variant="dashboard"
                size="sm"
                disabled={!isIntroMessageUpdated || isSavingGreeting}
                onClick={async () => {
                  if (metadata) {
                    const savedText = introMessage
                    setIsSavingGreeting(true)
                    const resp = await save({
                      course_intro_message: savedText,
                    })
                    setIsSavingGreeting(false)

                    // Text typed while the save was in flight isn't saved:
                    // leave it marked unsaved so Update stays available.
                    if (resp && introMessageRef.current === savedText) {
                      setIsIntroMessageUpdated(false)
                      setGreetingSaved(true)
                    } else if (!resp) {
                      console.log(
                        'Error upserting course metadata for course: ',
                        project_name,
                      )
                    }
                  }
                }}
              >
                Update
              </Button>
            </div>
          </div>
        </div>

        <div className="set_example_questions">
          <div className="mt-6 mb-3 font-semibold">Example questions</div>

          <div>
            {metadata && (
              <SetExampleQuestions
                course_name={project_name}
                course_metadata={metadata as CourseMetadataOptionalForUpsert}
              />
            )}
          </div>
        </div>

        {metadata && (
          <ChatbotTagsEditor
            course_name={project_name}
            course_metadata={metadata as CourseMetadataOptionalForUpsert}
          />
        )}

        <div className="upload_logo flex flex-col">
          <div className="mt-6 font-semibold">Add a logo</div>
          <div className="mb-3 text-sm text-(--foreground-faded)">
            This logo will appear in the header of the chat window.
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpg,image/gif"
              className="hidden"
              aria-label="Upload logo"
              onChange={(e) => {
                onUploadLogo(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoStatus === 'uploading'}
              className={`flex w-full items-center rounded-md border bg-(--background) px-3 py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                logoStatus === 'error'
                  ? 'border-(--error)'
                  : 'border-(--dashboard-border) hover:border-(--foreground-faded)'
              }`}
            >
              <span
                className={
                  logoStatus === 'error'
                    ? 'text-(--error)'
                    : logoFileName
                      ? logoStatus === 'success'
                        ? 'text-(--illinois-prairie)'
                        : 'text-(--foreground)'
                      : 'text-(--foreground-faded)'
                }
              >
                {logoStatus === 'error'
                  ? 'Upload failed — click to retry'
                  : logoFileName ||
                    'Select the logo to upload (.png, .jpg, or .gif)'}
              </span>
              <div className="ml-auto flex shrink-0 items-center pl-3">
                {logoStatus === 'uploading' ? (
                  <Spinner className="size-4 text-(--foreground-faded)" />
                ) : logoStatus === 'success' ? (
                  <Check className="size-4 text-(--illinois-prairie)" />
                ) : logoStatus === 'error' ? (
                  <AlertCircle className="size-4 text-(--error)" />
                ) : (
                  <IconFileUpload
                    size={20}
                    stroke={1}
                    className="text-(--foreground-faded)"
                  />
                )}
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default BrandingForm
