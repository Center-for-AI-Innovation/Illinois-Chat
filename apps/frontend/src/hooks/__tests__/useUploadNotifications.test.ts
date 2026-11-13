import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useUploadNotifications } from '../useUploadNotifications'
import { type FileUpload } from '~/components/UIUC-Components/UploadNotification'

const file = {
  name: 'a.pdf',
  status: 'uploading',
  type: 'document',
} as FileUpload

describe('useUploadNotifications', () => {
  it('accepts updater functions', () => {
    const { result } = renderHook(() => useUploadNotifications())
    act(() => result.current.setUploadFiles((prev) => [...prev, file]))
    expect(result.current.uploadFiles).toEqual([file])
  })

  it('clears the list on close', () => {
    const { result } = renderHook(() => useUploadNotifications())
    act(() => result.current.setUploadFiles([file]))
    act(() => result.current.closeNotification())
    expect(result.current.uploadFiles).toEqual([])
  })
})
