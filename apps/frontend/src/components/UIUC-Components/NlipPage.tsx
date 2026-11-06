import { montserrat_heading } from 'fonts'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import { type CourseMetadata } from '~/types/courseMetadata'
import { fetchCourseMetadata } from '~/utils/apiUtils'
import { Card } from '@/components/shadcn/ui/card'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import { CannotEditCourse } from './CannotEditCourse'
import GlobalFooter from './GlobalFooter'
import { LoadingPlaceholderForAdminPages } from './MainPageBackground'
import NlipAgentsPanel from './nlip/NlipAgentsPanel'

const NlipPage = ({ course_name }: { course_name: string }) => {
  const router = useRouter()
  const auth = useAuth()
  const [courseMetadata, setCourseMetadata] = useState<CourseMetadata | null>(
    null,
  )
  const [currentEmail, setCurrentEmail] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialCollapsedState(),
  )
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed)

  useEffect(() => {
    const fetchData = async () => {
      setCurrentEmail(auth.user?.profile.email as string)
      try {
        const metadata = (await fetchCourseMetadata(
          course_name,
        )) as CourseMetadata
        if (metadata && metadata.is_private) {
          metadata.is_private = JSON.parse(
            metadata.is_private as unknown as string,
          )
        }
        setCourseMetadata(metadata)
      } catch (error) {
        console.error(error)
      }
    }
    fetchData()
  }, [course_name, auth.isLoading, auth.user?.profile.email])

  if (auth.isLoading || !courseMetadata) {
    return <LoadingPlaceholderForAdminPages />
  }

  if (
    courseMetadata &&
    currentEmail !== (courseMetadata.course_owner as string) &&
    courseMetadata.course_admins.indexOf(currentEmail) === -1
  ) {
    const safeName = encodeURIComponent(course_name)
    router.replace(`/${safeName}/not_authorized`)
    return <CannotEditCourse course_name={course_name} />
  }

  return (
    <SettingsLayout
      course_name={course_name}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
    >
      <Head>
        <title>{course_name} - NLIP Agents</title>
        <meta
          name="description"
          content="Configure Natural Language Interaction Protocol (NLIP) for your project."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="course-page-main flex min-h-screen w-full flex-col items-center">
        <div className="items-left flex w-full flex-col justify-center py-0">
          <div className="flex w-full flex-col items-center">
            <Card
              className={`mt-[2%] ${cardWidthClasses} gap-0 rounded-4xl border p-0 shadow-none ring-0`}
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--dashboard-border)',
              }}
            >
              <div className="m-4 flex flex-wrap items-center gap-4">
                <h2
                  className={`heading-h2 ${montserrat_heading.variable} font-montserratHeading ml-4`}
                >
                  NLIP Agents
                </h2>
                <h5
                  className={`heading-h5 ${montserrat_heading.variable} font-montserratHeading ml-4 w-full text-left`}
                >
                  Connect remote agents so this project can ask them focused
                  questions, or let other agents query this project.
                </h5>
              </div>
            </Card>
            <div className={`${cardWidthClasses}`}>
              <NlipAgentsPanel project={course_name} />
            </div>
          </div>
        </div>
      </main>
      <GlobalFooter />
    </SettingsLayout>
  )
}

export default NlipPage
