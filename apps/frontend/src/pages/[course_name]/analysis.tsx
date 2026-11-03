import { type NextPage } from 'next'
import MakeQueryAnalysisPage from '~/components/UIUC-Components/MakeQueryAnalysisPage'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { CannotEditGPT4Page } from '~/components/UIUC-Components/CannotEditGPT4'
import { LoadingPlaceholderForAdminPages } from '~/components/UIUC-Components/MainPageBackground'
import {
  PermissionGate,
  getPermissionGateError,
  type PermissionGateErrorType,
} from '~/components/UIUC-Components/PermissionGate'
import { fetchCourseMetadata } from '~/utils/apiUtils'
import { type CourseMetadata } from '~/types/courseMetadata'
import { useAuth } from 'react-oidc-context'

const CourseMain: NextPage = () => {
  const router = useRouter()
  const auth = useAuth()
  const [isLoading, setIsLoading] = useState(true)
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
      setIsLoading(true)
      try {
        // Check exists
        const metadata: CourseMetadata = await fetchCourseMetadata(courseName)
        if (metadata === null) {
          setErrorType(404)
          return
        }
      } catch (error) {
        console.error(error)

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

  if (auth.isLoading || isLoading || courseName == null) {
    return <LoadingPlaceholderForAdminPages />
  }

  if ((!auth.user || !auth.isAuthenticated) && courseName) {
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
      <MakeQueryAnalysisPage course_name={courseName as string} />
    </>
  )
}
export default CourseMain
