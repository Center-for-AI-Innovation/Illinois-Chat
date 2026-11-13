import React from 'react'
import { useRouter } from 'next/router'
import { useAuth } from 'react-oidc-context'
import CourseAdminLayout from '~/components/Layout/CourseAdminLayout'
import { type NextPageWithLayout } from '~/pages/_app'
import { LoadingPlaceholderForAdminPages } from '~/components/UIUC-Components/MainPageBackground'
import ProjectDashboard from '~/components/UIUC-Components/ProjectDashboard'
import { PermissionGate } from '~/components/UIUC-Components/PermissionGate'
import { RoleCheckFailed } from '~/components/UIUC-Components/RoleCheckFailed'
import { useQuery } from '@tanstack/react-query'
import { type CourseMetadata } from '~/types/courseMetadata'
import { fetchCourseMetadata } from '~/utils/apiUtils'

const DashboardPage: NextPageWithLayout = () => {
  const router = useRouter()
  const auth = useAuth()
  const courseName = router.query.course_name as string

  const {
    data: metadata,
    isPending,
    isLoadingError,
    error,
    refetch,
  } = useQuery<CourseMetadata, Error & { status?: number }>({
    // Own key: UploadCard and others write raw metadata to ['courseMetadata', name]
    queryKey: ['dashboardCourseMetadata', courseName],
    queryFn: () => fetchCourseMetadata(courseName),
    retry: 1,
    enabled: Boolean(courseName),
  })

  if (isPending) {
    return <LoadingPlaceholderForAdminPages />
  }

  // A failed refetch keeps the loaded data, so only a failed first load blocks
  if (isLoadingError || !metadata) {
    if (error?.status === 404) {
      return <PermissionGate course_name={courseName} errorType={404} />
    }
    return (
      <RoleCheckFailed
        course_name={courseName}
        onRetry={() => void refetch()}
        title="We couldn't load this dashboard"
        message="Something went wrong while loading the project. Try again in a moment."
      />
    )
  }

  return (
    <ProjectDashboard
      course_name={courseName}
      metadata={metadata}
      current_email={auth.user?.profile.email as string}
    />
  )
}

DashboardPage.getLayout = (page) => (
  <CourseAdminLayout>{page}</CourseAdminLayout>
)

export default DashboardPage
