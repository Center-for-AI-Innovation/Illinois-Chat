// src/pages/[course_name]/prompt.tsx
import Head from 'next/head'
import { useRouter } from 'next/router'
import React, { useState } from 'react'

import { Card } from '@/components/shadcn/ui/card'
import { useAuth } from 'react-oidc-context'
import CourseAdminLayout from '~/components/Layout/CourseAdminLayout'
import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import PromptEditor from '~/components/UIUC-Components/PromptEditor'
import { type NextPageWithLayout } from '~/pages/_app'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import GlobalFooter from '../../components/UIUC-Components/GlobalFooter'

const PromptPage: NextPageWithLayout = () => {
  const router = useRouter()
  const auth = useAuth()
  const courseName = router.query.course_name as string
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialCollapsedState(),
  )
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed)

  return (
    <SettingsLayout
      course_name={courseName}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
    >
      <Head>
        <title>{courseName} — Prompt Settings — Illinois Chat</title>
      </Head>
      <main
        id="main-content"
        tabIndex={-1}
        className="course-page-main flex min-h-screen w-full flex-col items-center"
      >
        <h1 className="sr-only">{courseName} Prompt Settings</h1>
        <div className="items-left flex w-full flex-col justify-center py-0">
          <div className="flex w-full flex-col items-center">
            <Card
              className={`mt-[2%] gap-0 rounded-2xl border border-(--dashboard-border) bg-(--background) py-0 ${cardWidthClasses}`}
            >
              <PromptEditor
                project_name={courseName}
                isEmbedded={false}
                showHeader={true}
                userEmail={auth.user?.profile?.email as string}
              />
            </Card>
          </div>
        </div>
      </main>

      <GlobalFooter />
    </SettingsLayout>
  )
}

PromptPage.getLayout = (page) => <CourseAdminLayout>{page}</CourseAdminLayout>

export default PromptPage
