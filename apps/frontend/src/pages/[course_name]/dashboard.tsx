import { type NextPage } from 'next'
import MakeOldCoursePage from '~/components/UIUC-Components/MakeOldCoursePage'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import { useAuth } from 'react-oidc-context'
import { CannotEditGPT4Page } from '~/components/UIUC-Components/CannotEditGPT4'
import { LoadingPlaceholderForAdminPages } from '~/components/UIUC-Components/MainPageBackground'
import {
  PermissionGate,
  getPermissionGateError,
  type PermissionGateErrorType,
} from '~/components/UIUC-Components/PermissionGate'

import { type CourseMetadata } from '~/types/courseMetadata'
import { fetchCourseMetadata } from '~/utils/apiUtils'

const CourseMain: NextPage = () => {
  const router = useRouter()

  const getCurrentPageName = () => {
    const raw = router.query.course_name
    return typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw[0]
        : undefined
  }
  const courseName = getCurrentPageName() as string

  const auth = useAuth()
  const [metadata, setMetadata] = useState<CourseMetadata | null>()
  const [isLoading, setIsLoading] = useState(true)
  const [errorType, setErrorType] = useState<PermissionGateErrorType | null>(
    null,
  )
  const [errorRequestId, setErrorRequestId] = useState<string>()

  useEffect(() => {
    if (!router.isReady || auth.isLoading) return
    const fetchCourseData = async () => {
      setIsLoading(true)
      try {
        const local_metadata: CourseMetadata = (await fetchCourseMetadata(
          courseName,
        )) as CourseMetadata

        if (local_metadata == null) {
          setErrorType(404)
          return
        }

        if (local_metadata && local_metadata.is_private) {
          local_metadata.is_private = JSON.parse(
            local_metadata.is_private as unknown as string,
          )
        }
        setMetadata(local_metadata)
      } catch (error) {
        console.error(error)
        // alert('An error occurred while fetching course metadata. Please try again later.')

        const gateError = getPermissionGateError(error)
        if (gateError) {
          setErrorType(gateError.errorType)
          setErrorRequestId(gateError.requestId)
        }
      } finally {
        setIsLoading(false)
      }
    }
    fetchCourseData()
  }, [router.isReady, auth.isLoading, courseName])

  useEffect(() => {
    if (!router.isReady) return
    if (auth.isLoading) return
    if (!metadata) return
    if (metadata == null) return

    // Everything is loaded
    setIsLoading(false)
  }, [router.isReady, auth.isLoading, metadata])

  if (isLoading) {
    return <LoadingPlaceholderForAdminPages />
  }

  if (!auth.isAuthenticated && courseName) {
    return <PermissionGate course_name={courseName as string} />
  }

  if (
    courseName.toLowerCase() == 'gpt4' ||
    courseName.toLowerCase() == 'global' ||
    courseName.toLowerCase() == 'extreme'
  ) {
    // Don't edit certain special pages (no context allowed)
    return <CannotEditGPT4Page course_name={courseName as string} />
  }

  if (errorType !== null) {
    return (
      <PermissionGate
        course_name={courseName ? (courseName as string) : 'new'}
        errorType={errorType}
        requestId={errorRequestId}
      />
    )
  }

  return (
    <>
      <MakeOldCoursePage
        course_name={courseName as string}
        metadata={metadata as CourseMetadata}
        current_email={auth.user?.profile.email as string}
      />
    </>
  )
}
export default CourseMain
