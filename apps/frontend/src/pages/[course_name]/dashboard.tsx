import React from 'react'
import { useRouter } from 'next/router'
import { useAuth } from 'react-oidc-context'
import CourseAdminLayout from '~/components/Layout/CourseAdminLayout'
import { type NextPageWithLayout } from '~/pages/_app'
import { LoadingPlaceholderForAdminPages } from '~/components/UIUC-Components/MainPageBackground'
import MakeOldCoursePage from '~/components/UIUC-Components/MakeOldCoursePage'
import { PermissionGate } from '~/components/UIUC-Components/PermissionGate'
import { useFetchCourseMetadata } from '~/hooks/queries/useFetchCourseMetadata'

const DashboardPage: NextPageWithLayout = () => {
  const router = useRouter()
  const auth = useAuth()
  const courseName = router.query.course_name as string

  const {
    data: metadata,
    isPending,
    isError,
  } = useFetchCourseMetadata({
    courseName,
  })

  if (isPending) {
    return <LoadingPlaceholderForAdminPages />
  }

  if (isError || !metadata) {
    return <PermissionGate course_name={courseName} errorType={404} />
  }

  return (
    <MakeOldCoursePage
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
