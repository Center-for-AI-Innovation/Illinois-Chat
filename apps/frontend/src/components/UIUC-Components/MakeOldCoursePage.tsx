import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState } from 'react'

import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import GlobalFooter from './GlobalFooter'

import { type CourseMetadata } from '~/types/courseMetadata'
import { CannotEditCourse } from './CannotEditCourse'
import DocumentGroupsCard from './DocumentGroupsCard'
import DocumentsCard from './DocumentsCard'
import { UploadCard } from './UploadCard'

const MakeOldCoursePage = ({
  course_name,
  metadata,
  current_email,
  isSuperAdmin = false,
}: {
  course_name: string
  metadata: CourseMetadata
  current_email: string
  isSuperAdmin?: boolean
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialCollapsedState,
  )
  const router = useRouter()

  if (
    metadata &&
    !isSuperAdmin &&
    current_email !== (metadata.course_owner as string) &&
    metadata.course_admins.indexOf(current_email) === -1
  ) {
    router.replace(`/${course_name}/not_authorized`)

    return <CannotEditCourse course_name={course_name as string} />
  }

  return (
    <SettingsLayout
      course_name={course_name}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
    >
      <Head>
        <title>{course_name} — Dashboard — Illinois Chat</title>
        <meta
          name="description"
          content="The AI teaching assistant built for students at UIUC."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main
        id="main-content"
        tabIndex={-1}
        className="course-page-main flex min-h-(--viewport-height) w-full flex-col items-center"
      >
        <h1 className="sr-only">{course_name} Dashboard</h1>
        <div className="items-left flex w-full flex-col justify-center py-0">
          <div className="flex w-full flex-col items-center">
            {/* Upload Card Section */}
            <UploadCard
              projectName={course_name}
              current_user_email={current_email}
              metadata={metadata}
              sidebarCollapsed={sidebarCollapsed}
            />

            {/* Document Groups Section */}
            <DocumentGroupsCard
              course_name={course_name}
              sidebarCollapsed={sidebarCollapsed}
            />

            {/* Project Files Section */}
            <DocumentsCard
              course_name={course_name}
              metadata={metadata}
              sidebarCollapsed={sidebarCollapsed}
            />

            {/* <NomicDocumentsCard course_name={course_name} metadata={metadata} /> */}
          </div>
        </div>
      </main>

      <GlobalFooter />
    </SettingsLayout>
  )
}

export default MakeOldCoursePage
