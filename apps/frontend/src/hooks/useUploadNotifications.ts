import { useCallback, useState } from 'react'
import { type FileUpload } from '~/components/UIUC-Components/UploadNotification'

// Owns the list of uploads shown in the floating upload notification.
export function useUploadNotifications() {
  const [uploadFiles, setUploadFiles] = useState<FileUpload[]>([])
  const closeNotification = useCallback(() => setUploadFiles([]), [])
  return { uploadFiles, setUploadFiles, closeNotification }
}
