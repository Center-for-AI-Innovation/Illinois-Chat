import { type NextPage } from 'next'
import React, { useEffect, useState } from 'react'
import { Montserrat } from 'next/font/google'
import { useRouter } from 'next/router'

import { CannotEditGPT4Page } from '~/components/UIUC-Components/CannotEditGPT4'
import {
  LoadingPlaceholderForAdminPages,
  MainPageBackground,
} from '~/components/UIUC-Components/MainPageBackground'
import {
  PermissionGate,
  getPermissionGateError,
  type PermissionGateErrorType,
} from '~/components/UIUC-Components/PermissionGate'

import MakeToolsPage from '~/components/UIUC-Components/SimPage'
import posthog from 'posthog-js'
import { useAuth } from 'react-oidc-context'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '~/utils/app/const'

const montserrat = Montserrat({
  weight: '700',
  subsets: ['latin'],
})

const ToolsPage: NextPage = () => {
  const router = useRouter()
  const auth = useAuth()

  const [courseData, setCourseData] = useState(null)
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
        const exsitResponse = await fetch(
          `/api/UIUC-api/getCourseExists?course_name=${courseName}`,
        )
        if (!exsitResponse.ok) {
          const gateError = getPermissionGateError({
            status: exsitResponse.status,
            requestId: exsitResponse.headers.get('x-request-id'),
          })
          if (gateError) {
            setErrorType(gateError.errorType)
            setErrorRequestId(gateError.requestId)
          }
          return
        }

        const data = await exsitResponse.json()
        if (!data) {
          setErrorType(404)
          return
        } else {
          const dataResponse = await fetch(
            `/api/UIUC-api/getAllCourseData?course_name=${courseName}`,
          )
          if (!dataResponse.ok) {
            const gateError = getPermissionGateError({
              status: dataResponse.status,
              requestId: dataResponse.headers.get('x-request-id'),
            })
            if (gateError) {
              setErrorType(gateError.errorType)
              setErrorRequestId(gateError.requestId)
            }
            return
          }
          const data = await dataResponse.json()
          const courseData = data.distinct_files
          setCourseData(courseData)
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

      posthog.capture('tool_page_visited', {
        course_name: courseName,
      })
    }
    fetchCourseData()
  }, [router.isReady, auth.isLoading, courseName])

  if (auth.isLoading || isLoading || courseName === undefined) {
    return <LoadingPlaceholderForAdminPages />
  }

  if (!auth.isAuthenticated) {
    return <PermissionGate course_name={courseName as string} />
  }

  const user_emails = auth.user?.profile?.email ? [auth.user.profile.email] : []

  // if their account is somehow broken (with no email address)
  // Don't edit certain special pages (no context allowed)
  if (
    courseName &&
    (courseName.toLowerCase() == 'gpt4' ||
      courseName.toLowerCase() == 'global' ||
      courseName.toLowerCase() == 'extreme')
  ) {
    return <CannotEditGPT4Page course_name={courseName as string} />
  }

  if (user_emails.length == 0) {
    return (
      <MainPageBackground>
        <h3
          className={`heading-h3 mt-16 bg-[linear-gradient(50deg,gold,white)] bg-clip-text p-8 text-transparent ${montserrat.className}`}
        >
          You&apos;ve encountered a software bug!<br></br>Your account has no
          email address. Please send us an email so we can fix it for you:{' '}
          <a className="goldUnderline" href={SUPPORT_MAILTO}>
            {SUPPORT_EMAIL}
          </a>
        </h3>
      </MainPageBackground>
    )
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
      <MakeToolsPage course_name={courseName as string} />
    </>
  )
}
export default ToolsPage
