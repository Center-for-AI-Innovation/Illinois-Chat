import React from 'react'
import CourseAdminLayout from '~/components/Layout/CourseAdminLayout'
import { type NextPageWithLayout } from '~/pages/_app'
import APIKeyInputForm from '~/components/UIUC-Components/api-inputs/LLMsApiKeyInputForm'

const LLMsPage: NextPageWithLayout = () => {
  return <APIKeyInputForm />
}

LLMsPage.getLayout = (page) => <CourseAdminLayout>{page}</CourseAdminLayout>

export default LLMsPage
