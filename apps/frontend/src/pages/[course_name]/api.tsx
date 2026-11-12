// src/pages/[course_name]/api.tsx
import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from 'react-oidc-context'
import CourseAdminLayout from '~/components/Layout/CourseAdminLayout'
import { type NextPageWithLayout } from '~/pages/_app'
import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import ApiKeyManagement from '~/components/UIUC-Components/ApiKeyManagament'
import GlobalFooter from '~/components/UIUC-Components/GlobalFooter'

const ApiPage: NextPageWithLayout = () => {
  const router = useRouter()
  const auth = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialCollapsedState(),
  )
  const courseName = router.query.course_name as string

  return (
    <SettingsLayout
      course_name={courseName}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
    >
      <Head>
        <title>{courseName} — API Settings — Illinois Chat</title>
      </Head>
      <main
        id="main-content"
        tabIndex={-1}
        className="course-page-main flex min-h-screen w-full flex-col items-center"
      >
        <h1 className="sr-only">{courseName} API Settings</h1>
        <div className="items-left flex w-full flex-col justify-center py-0">
          <div className="flex w-full flex-col items-center">
            <ApiKeyManagement
              course_name={courseName}
              auth={auth}
              sidebarCollapsed={sidebarCollapsed}
            />
          </div>
        </div>
      </main>

      <GlobalFooter />
    </SettingsLayout>
  )
}

ApiPage.getLayout = (page) => <CourseAdminLayout>{page}</CourseAdminLayout>

export default ApiPage
