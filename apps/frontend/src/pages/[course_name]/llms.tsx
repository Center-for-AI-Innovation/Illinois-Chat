import { type NextPage } from 'next'
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
import { fetchCourseMetadata } from '~/utils/apiUtils'
import { type CourseMetadata } from '~/types/courseMetadata'
import APIKeyInputForm from '~/components/UIUC-Components/api-inputs/LLMsApiKeyInputForm'

const CourseMain: NextPage = () => {
  const router = useRouter()

  const auth = useAuth()
  const [isFetchingCourseMetadata, setIsFetchingCourseMetadata] = useState(true)
  const [errorType, setErrorType] = useState<PermissionGateErrorType | null>(
    null,
  )
  const [errorRequestId, setErrorRequestId] = useState<string>()

  const getCurrentPageName = () => {
    const raw = router.query.course_name
    return typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw[0]
        : undefined
  }
  const courseName = getCurrentPageName() as string

  useEffect(() => {
    if (!router.isReady || auth.isLoading) return
    const fetchCourseData = async () => {
      setIsFetchingCourseMetadata(true)

      try {
        const metadata: CourseMetadata = await fetchCourseMetadata(courseName)
        if (metadata === null) {
          setErrorType(404)
          return
        }
      } catch (error) {
        console.error(error)
        // alert('An error occurred while fetching course metadata. Please try again later.')

        const gateError = getPermissionGateError(error)
        if (gateError) {
          setErrorType(gateError.errorType)
          setErrorRequestId(gateError.requestId)
        }
      } finally {
        setIsFetchingCourseMetadata(false)
      }
    }
    fetchCourseData()
  }, [router.isReady, auth.isLoading, courseName])

  if (auth.isLoading || isFetchingCourseMetadata || courseName == null) {
    return <LoadingPlaceholderForAdminPages />
  }

  if (!auth.isAuthenticated) {
    console.log(
      'User not logged in',
      auth.isAuthenticated,
      auth.isLoading,
      courseName,
    )
    return <PermissionGate course_name={courseName as string} />
  }

  // Don't edit certain special pages (no context allowed)
  if (
    courseName.toLowerCase() == 'gpt4' ||
    courseName.toLowerCase() == 'global' ||
    courseName.toLowerCase() == 'extreme'
  ) {
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
      <APIKeyInputForm />
    </>
  )
}
export default CourseMain
