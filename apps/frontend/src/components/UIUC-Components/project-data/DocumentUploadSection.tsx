import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from 'react-oidc-context'

import { Skeleton } from '@/components/shadcn/ui/skeleton'
import { type CourseMetadata } from '~/types/courseMetadata'
import LargeDropzone from '../LargeDropzone'
import { type FileUpload } from '../UploadNotification'

export function DocumentUploadSection({
  projectName,
  courseMetadata,
  uploadFiles,
  setUploadFiles,
}: {
  projectName: string
  courseMetadata?: CourseMetadata
  uploadFiles: FileUpload[]
  setUploadFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>
}) {
  const auth = useAuth()
  const queryClient = useQueryClient()

  if (!courseMetadata) {
    return <Skeleton className="h-50 w-full rounded-xl" />
  }

  return (
    <LargeDropzone
      courseName={projectName}
      current_user_email={auth.user?.profile?.email ?? ''}
      isDisabled={false}
      courseMetadata={courseMetadata}
      is_new_course={false}
      uploadFiles={uploadFiles}
      setUploadFiles={setUploadFiles}
      queryClient={queryClient}
      auth={auth}
    />
  )
}
