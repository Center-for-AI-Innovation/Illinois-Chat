import React from 'react'
import { useRouter } from 'next/router'
import CourseAdminLayout from '~/components/Layout/CourseAdminLayout'
import { type NextPageWithLayout } from '~/pages/_app'
import MakeQueryAnalysisPage from '~/components/UIUC-Components/MakeQueryAnalysisPage'

const AnalysisPage: NextPageWithLayout = () => {
  const router = useRouter()
  return (
    <MakeQueryAnalysisPage course_name={router.query.course_name as string} />
  )
}

AnalysisPage.getLayout = (page) => <CourseAdminLayout>{page}</CourseAdminLayout>

export default AnalysisPage
