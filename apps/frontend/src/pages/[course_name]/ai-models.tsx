import { type NextPage } from 'next'
import Head from 'next/head'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from 'react-oidc-context'

import { CannotEditGPT4Page } from '~/components/UIUC-Components/CannotEditGPT4'
import { LoadingPlaceholderForAdminPages } from '~/components/UIUC-Components/MainPageBackground'
import { PermissionGate } from '~/components/UIUC-Components/PermissionGate'
import { AdminLayout } from '~/components/UIUC-Components/admin-layout/AdminLayout'
import { AIModelsContent } from '~/components/UIUC-Components/ai-models/AIModelsContent'
import { useAIModelsSettings } from '~/components/UIUC-Components/ai-models/useAIModelsSettings'
import { fetchCourseMetadata } from '~/utils/apiUtils'

// Redesigned replacement for /[course_name]/llms. The guard below is copied
// from llms.tsx on purpose: /llms is deleted once this page replaces it.
const AIModelsPage: NextPage = () => {
  const router = useRouter()
  const auth = useAuth()
  const raw = router.query.course_name
  const courseName = (Array.isArray(raw) ? raw[0] : raw) as string
  const [isFetchingCourseMetadata, setIsFetchingCourseMetadata] = useState(true)
  const [errorType, setErrorType] = useState<401 | 403 | 404 | null>(null)

  useEffect(() => {
    if (!router.isReady || auth.isLoading) return
    const fetchCourseData = async () => {
      setIsFetchingCourseMetadata(true)
      try {
        const metadata = await fetchCourseMetadata(courseName)
        if (metadata === null) setErrorType(404)
      } catch (error) {
        console.error(error)
        const status = (error as Error & { status?: number }).status
        if (status === 401 || status === 403 || status === 404) {
          setErrorType(status)
        }
      } finally {
        setIsFetchingCourseMetadata(false)
      }
    }
    void fetchCourseData()
  }, [router.isReady, auth.isLoading, courseName])

  if (auth.isLoading || isFetchingCourseMetadata || courseName == null) {
    return <LoadingPlaceholderForAdminPages />
  }
  if (!auth.isAuthenticated) {
    return <PermissionGate course_name={courseName} />
  }
  // Don't edit certain special pages (no context allowed)
  if (['gpt4', 'global', 'extreme'].includes(courseName.toLowerCase())) {
    return <CannotEditGPT4Page course_name={courseName} />
  }
  if (errorType !== null) {
    return <PermissionGate course_name={courseName} errorType={errorType} />
  }

  return <AIModelsAdmin courseName={courseName} />
}

// Separate component so the data hook only runs once access is confirmed.
function AIModelsAdmin({ courseName }: { courseName: string }) {
  const settings = useAIModelsSettings(courseName)
  return (
    <AdminLayout courseName={courseName}>
      <Head>
        <title>{`${courseName} — AI Models — Illinois Chat`}</title>
      </Head>
      <AIModelsContent projectName={courseName} settings={settings} />
    </AdminLayout>
  )
}

export default AIModelsPage
