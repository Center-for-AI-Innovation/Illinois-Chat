import { type NextPage } from 'next'
import Head from 'next/head'
import React from 'react'
import { useRouter } from 'next/router'

import { CannotEditGPT4Page } from '~/components/UIUC-Components/CannotEditGPT4'
import { AdminLayout } from '~/components/UIUC-Components/admin-layout/AdminLayout'
import { ProjectDataContent } from '~/components/UIUC-Components/project-data/ProjectDataContent'
import { useFetchCourseMetadata } from '~/hooks/queries/useFetchCourseMetadata'

// Access (signed in, chatbot exists, owner or admin) is decided by
// AdminLayout; this page only keeps the legacy special-name check.
const ProjectDataPage: NextPage = () => {
  const router = useRouter()
  const raw = router.query.course_name
  const courseName = (Array.isArray(raw) ? raw[0] : raw) as string | undefined

  if (!router.isReady || courseName == null) return null
  // Don't edit certain special pages (no context allowed)
  if (['gpt4', 'global', 'extreme'].includes(courseName.toLowerCase())) {
    return <CannotEditGPT4Page course_name={courseName} />
  }

  return (
    <AdminLayout courseName={courseName}>
      <Head>
        <title>{`${courseName} — Project Data — Illinois Chat`}</title>
      </Head>
      <ProjectDataBody courseName={courseName} />
    </AdminLayout>
  )
}

// Rendered inside AdminLayout, so its data hooks only run for the owner and
// admins. Same query key as AdminLayout, so this is served from the cache.
function ProjectDataBody({ courseName }: { courseName: string }) {
  const { data: courseMetadata } = useFetchCourseMetadata({ courseName })
  return (
    <ProjectDataContent
      projectName={courseName}
      courseMetadata={courseMetadata}
    />
  )
}

export default ProjectDataPage
