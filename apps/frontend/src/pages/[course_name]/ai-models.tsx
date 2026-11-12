import { type NextPage } from 'next'
import Head from 'next/head'
import React from 'react'
import { useRouter } from 'next/router'

import { CannotEditGPT4Page } from '~/components/UIUC-Components/CannotEditGPT4'
import { AdminLayout } from '~/components/UIUC-Components/admin-layout/AdminLayout'
import { AIModelsContent } from '~/components/UIUC-Components/ai-models/AIModelsContent'
import { useAIModelsSettings } from '~/components/UIUC-Components/ai-models/useAIModelsSettings'

// Redesigned replacement for /[course_name]/llms. Access (signed in, chatbot
// exists, owner or admin) is decided by AdminLayout, so every admin page gets
// the same rule; this page only keeps the legacy special-name check.
const AIModelsPage: NextPage = () => {
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
        <title>{`${courseName} — AI Models — Illinois Chat`}</title>
      </Head>
      <AIModelsBody courseName={courseName} />
    </AdminLayout>
  )
}

// Rendered inside AdminLayout, so the settings are only fetched for users who
// pass the access check.
function AIModelsBody({ courseName }: { courseName: string }) {
  const settings = useAIModelsSettings(courseName)
  return <AIModelsContent projectName={courseName} settings={settings} />
}

export default AIModelsPage
