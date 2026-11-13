import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import posthog from 'posthog-js'
import CourseAdminLayout from '~/components/Layout/CourseAdminLayout'
import { type NextPageWithLayout } from '~/pages/_app'
import MakeToolsPage from '~/components/UIUC-Components/SimPage'

const ToolsPage: NextPageWithLayout = () => {
  const router = useRouter()
  const courseName = router.query.course_name as string

  useEffect(() => {
    posthog.capture('tool_page_visited', { course_name: courseName })
  }, [courseName])

  return <MakeToolsPage course_name={courseName} />
}

ToolsPage.getLayout = (page) => <CourseAdminLayout>{page}</CourseAdminLayout>

export default ToolsPage
