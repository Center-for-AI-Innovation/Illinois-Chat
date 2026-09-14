import { Button } from '@/components/shadcn/ui/button'
import { Card } from '@/components/shadcn/ui/card'
import { Input } from '@/components/shadcn/ui/input'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'

import {
  IconCircleCheck,
  IconCircleDashed,
  IconExternalLink,
} from '@tabler/icons-react'

import { type CourseMetadata } from '~/types/courseMetadata'
import { CannotEditCourse } from './CannotEditCourse'

import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import { showToast } from '~/utils/toastUtils'
import GlobalFooter from './GlobalFooter'
import { LoadingPlaceholderForAdminPages } from './MainPageBackground'
import { N8nWorkflowsTable } from './N8nWorkflowsTable'

import { montserrat_heading, montserrat_paragraph } from 'fonts'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import { fetchCourseMetadata } from '~/utils/apiUtils'
import { useFetchAllWorkflows } from '~/utils/functionCalling/handleFunctionCalling'
import { IntermediateStateAccordion } from './IntermediateStateAccordion'

// Utility function for responsive card widths based on sidebar state

export const GetCurrentPageName = () => {
  // /CS-125/dashboard --> CS-125
  return useRouter().asPath.slice(1).split('/')[0] as string
}

const MakeToolsPage = ({ course_name }: { course_name: string }) => {
  const router = useRouter()
  const currentPageName = GetCurrentPageName()
  const auth = useAuth()

  const useIllinoisChatConfig = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG?.toLowerCase() === 'true'
    )
  }, [])

  const [courseMetadata, setCourseMetadata] = useState<CourseMetadata | null>(
    null,
  )
  const [currentEmail, setCurrentEmail] = useState('')
  const [n8nApiKeyTextbox, setN8nApiKeyTextbox] = useState('')
  const [n8nApiKey, setN8nApiKey] = useState('')
  const [isEmptyWorkflowTable, setIsEmptyWorkflowTable] =
    useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialCollapsedState(),
  )
  const isSmallScreen = useMediaQuery('(max-width: 960px)')

  // Get responsive card width classes
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed)

  const {
    data: flows_table,
    isSuccess: isSuccess,
    // isLoading: isLoadingTools,
    isError: isErrorTools,
    refetch: refetchWorkflows,
  } = useFetchAllWorkflows(GetCurrentPageName())

  const handleSaveApiKey = async () => {
    console.log('IN handleSaveApiKey w/ key: ', n8nApiKeyTextbox)

    // TEST KEY TO SEE IF VALID (unless it's empty, that's fine.)
    if (n8nApiKeyTextbox) {
      const keyTestResponse = await fetch(`/api/UIUC-api/tools/testN8nAPI`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          n8nApiKey: n8nApiKeyTextbox,
        }),
      })
      console.log('keyTestResponse: ', await keyTestResponse.json())

      if (!keyTestResponse.ok) {
        showToast({
          title: 'Key appears invalid',
          message:
            'This API key cannot fetch any workflows. Please check your key and try again.',
          type: 'error',
          autoClose: 15000,
        })
        // Key invalid - exit early
        return
      }

      setIsEmptyWorkflowTable(false)
    } else {
      setIsEmptyWorkflowTable(true)
      console.log('KEY IS EMPTY: ', n8nApiKeyTextbox)
    }

    console.log('Saving n8n API Key:', n8nApiKeyTextbox)
    const response = await fetch(`/api/UIUC-api/tools/upsertN8nAPIKey`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        course_name: currentPageName,
        n8n_api_key: n8nApiKeyTextbox,
      }),
    })
    setN8nApiKey(n8nApiKeyTextbox)
    refetchWorkflows()

    if (isErrorTools) {
      errorFetchingWorkflowsToast()
      return
    }

    if (!flows_table) {
      showToast({
        title: 'Error',
        message: 'Failed to fetch workflows. Please try again later.',
        type: 'error',
        autoClose: 10000,
      })
      return
    }

    if (response.ok) {
      showToast({
        title: 'Success',
        message: 'n8n API Key saved successfully!',
        type: 'success',
        autoClose: 10000,
      })
    } else {
      showToast({
        title: 'Error',
        message: 'Failed to save n8n API Key. Please try again later.',
        type: 'error',
        autoClose: 10000,
      })
    }
    setIsLoading(false)
  }

  useEffect(() => {
    const getApiKey = async () => {
      try {
        const response = await fetch('/api/UIUC-api/getN8Napikey', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ course_name: currentPageName }),
        })

        const data = await response.json()
        const apiKey = data.api_key?.[0]?.n8n_api_key

        if (apiKey) {
          setN8nApiKeyTextbox(apiKey)
          setN8nApiKey(apiKey)
        } else {
          console.warn('API key not found in response:', data)
        }
      } catch (error) {
        console.error('Error getting course data:', error)
      }
    }

    getApiKey()
  }, [currentPageName])

  useEffect(() => {
    const fetchData = async () => {
      const userEmail = auth.user?.profile.email
      setCurrentEmail(userEmail as string)

      try {
        const metadata: CourseMetadata = (await fetchCourseMetadata(
          currentPageName,
        )) as CourseMetadata

        if (metadata && metadata.is_private) {
          metadata.is_private = JSON.parse(
            metadata.is_private as unknown as string,
          )
        }
        setCourseMetadata(metadata)
      } catch (error) {
        console.error(error)
        // alert('An error occurred while fetching course metadata. Please try again later.')
      }
    }

    fetchData()
  }, [currentPageName, !auth.isLoading])

  const errorFetchingWorkflowsToast = () => {
    showToast({
      title: 'Error fetching workflows',
      message: 'No records found. Please check your API key and try again.',
      type: 'error',
      autoClose: 12000,
    })
  }

  if (auth.isLoading || !courseMetadata) {
    return <LoadingPlaceholderForAdminPages />
  }

  // Check auth
  if (
    courseMetadata &&
    currentEmail !== (courseMetadata.course_owner as string) &&
    courseMetadata.course_admins.indexOf(currentEmail) === -1
  ) {
    router.replace(`/${course_name}/not_authorized`)

    return (
      <CannotEditCourse
        course_name={currentPageName as string}
        // current_email={currentEmail as string}
      />
    )
  }
  // console.log('n8n api key:', n8nApiKey)
  // console.log(
  //   'setup instructions default value:',
  //   n8nApiKey ? undefined : 'setup-instructions',
  // )
  // console.log(
  //   'usage instructions default value:',
  //   n8nApiKey && !isEmptyWorkflowTable ? 'usage-instruction' : undefined,
  // )

  return (
    <SettingsLayout
      course_name={course_name}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
    >
      <Head>
        <title>{course_name} — Tools — Illinois Chat</title>
        <meta
          name="description"
          content="The AI teaching assistant built for students at UIUC."
        />
        <link rel="icon" href="/favicon.ico" />
        {/* <Header /> */}
      </Head>
      <main
        id="main-content"
        tabIndex={-1}
        className="course-page-main flex min-h-screen w-full flex-col items-center"
      >
        <h1 className="sr-only">{course_name} Tools</h1>
        <div className="items-left flex w-full flex-col justify-center py-0">
          <div className="flex w-full flex-col items-center">
            {useIllinoisChatConfig && (
              <Card
                className="p-0"
                style={{
                  color: 'var(--foreground)',
                  margin: '5%',
                  backgroundColor: 'var(--background)',
                }}
              >
                <h2
                  className={`heading-h2 ${montserrat_heading.variable} font-montserratHeading ml-4`}
                >
                  Coming soon!
                </h2>
              </Card>
            )}
            <Card
              className={`mt-[2%] rounded-4xl border p-0 ${cardWidthClasses}`}
              style={{
                marginTop: '2%',
                backgroundColor: 'var(--background)',
                borderColor: 'var(--dashboard-border)',
              }}
            >
              <div className="flex flex-col md:flex-row">
                <div
                  style={{
                    color: 'var(--foreground)',
                  }}
                  className="min-h-full flex-[1_1_100%] bg-(--background) md:flex-[1_1_60%]"
                >
                  <div className="m-4 flex flex-wrap items-start gap-5">
                    <h2
                      className={`heading-h2 ${montserrat_heading.variable} font-montserratHeading ml-4`}
                    >
                      LLM Tool Use &amp; Function Calling
                    </h2>
                    <div className="flex flex-col items-start justify-start gap-3">
                      <div className="flex flex-col lg:flex-row">
                        <h3
                          className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading ml-4 w-full flex-[1_1_50%] text-left`}
                          style={{
                            ...(useIllinoisChatConfig && {
                              color: 'var(--illinois-storm-dark)',
                            }),
                          }}
                        >
                          Use{' '}
                          <a
                            href="https://n8n.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`text-(--dashboard-button) underline hover:text-(--dashboard-button-hover) ${montserrat_heading.variable} font-montserratHeading`}
                          >
                            n8n.io&apos;s{' '}
                            <IconExternalLink
                              className="mr-2 inline-block"
                              style={{ position: 'relative', top: '-3px' }}
                              aria-hidden="true"
                            />
                          </a>
                          beautiful visual workflow editor to create custom
                          functions for your project.
                        </h3>
                        <Button
                          onClick={(event) =>
                            window.open(
                              `https://tools.uiuc.chat/workflows`,
                              '_blank',
                            )
                          }
                          className="mx-[8%] mt-2 max-w-[50%] rounded-lg bg-(--dashboard-button) hover:bg-(--dashboard-button-hover) disabled:bg-(--button-disabled) disabled:text-(--button-disabled-text-color) lg:flex-[1_1_50%] lg:self-center"
                          type="submit"
                          disabled={!n8nApiKey}
                        >
                          {'Create/Edit Workflows'}
                        </Button>
                      </div>
                      {useIllinoisChatConfig ? (
                        <div />
                      ) : (
                        <IntermediateStateAccordion
                          accordionKey="setup-instructions"
                          chevron={
                            n8nApiKey ? (
                              <IconCircleCheck aria-hidden="true" />
                            ) : (
                              <IconCircleDashed aria-hidden="true" />
                            )
                          }
                          disableChevronRotation
                          title={
                            <h3
                              style={{ margin: '0 auto', textAlign: 'left' }}
                              className={`pt-3 pb-3 text-2xl font-bold ${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              Setup Instructions 🤠
                            </h3>
                          }
                          isLoading={false}
                          error={false}
                          defaultValue={
                            !n8nApiKey ? 'setup-instructions' : undefined
                          }
                          content={
                            <ol
                              className={`list-decimal space-y-4 pl-6 ${montserrat_paragraph.variable} font-montserratParagraph text-(--foreground)`}
                            >
                              <li>
                                Tool use via LLMs is invite-only to prevent
                                abuse. Please shoot our admin an email for
                                access:{' '}
                                <a
                                  href="mailto:rohan13@illinois.edu"
                                  style={{
                                    color: 'var(--link)',
                                    textDecoration: 'underline',
                                  }}
                                >
                                  rohan13@illinois.edu
                                </a>
                              </li>
                              <li>
                                Once you have access, please{' '}
                                <b>
                                  <a
                                    href="https://tools.uiuc.chat/setup"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-(--dashboard-button) hover:text-(--dashboard-button-hover)"
                                    style={{
                                      textDecoration: 'underline',
                                    }}
                                  >
                                    login with this link
                                  </a>
                                  .
                                </b>
                              </li>
                              <li>
                                Inside n8n,{' '}
                                <b>create an n8n API key and save it here</b>.
                              </li>
                            </ol>
                          }
                        />
                      )}
                      {n8nApiKey && (
                        <IntermediateStateAccordion
                          accordionKey="usage-instructions"
                          chevron={
                            n8nApiKey && isEmptyWorkflowTable ? (
                              <IconCircleDashed aria-hidden="true" />
                            ) : (
                              <IconCircleCheck aria-hidden="true" />
                            )
                          }
                          disableChevronRotation
                          title={
                            <h4
                              style={{ margin: '0 auto', textAlign: 'left' }}
                              className={`pt-3 pb-3 text-2xl font-bold ${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              Usage Instructions 🛠️
                            </h4>
                          }
                          isLoading={false}
                          error={false}
                          defaultValue={
                            n8nApiKey && isEmptyWorkflowTable
                              ? 'usage-instructions'
                              : undefined
                          }
                          content={
                            <>
                              <ol
                                className={`w-[80%] list-decimal space-y-2 pl-6 ${montserrat_paragraph.variable} font-montserratParagraph text-(--foreground)`}
                              >
                                <li>
                                  Start by creating your first workflow on{' '}
                                  <a
                                    href="https://tools.uiuc.chat/workflows"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-(--dashboard-button) hover:text-(--dashboard-button-hover) hover:underline"
                                  >
                                    N8N
                                  </a>
                                </li>
                                <li>
                                  Ensure you have the correct trigger node for
                                  your workflow, check docs for details
                                </li>
                                <li>
                                  Add the necessary nodes for your workflow
                                </li>
                                <li>Save your workflow</li>
                                <li>
                                  Make sure your workflow is active
                                </li>
                                <li>
                                  Test your workflow to complete usage
                                  onboarding
                                </li>
                              </ol>
                              <h3
                                className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading ps-5 text-center`}
                              >
                                If your workflow is working as expected,
                                Congrats! 🚀
                                <br></br>
                                Your users can now start using it on the{' '}
                                <a
                                  href={`/${course_name}/chat`}
                                  rel="noopener noreferrer"
                                  className="text-(--dashboard-button) hover:text-(--dashboard-button-hover)"
                                  style={{
                                    textDecoration: 'underline',
                                  }}
                                >
                                  Chat Page
                                </a>
                                !
                              </h3>
                            </>
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div
                  className="flex flex-[1_1_100%] md:flex-[1_1_40%]"
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--dashboard-sidebar-background)',
                    color: 'var(--dashboard-foreground)',
                    borderLeft: isSmallScreen
                      ? ''
                      : '1px solid var(--dashboard-border)',
                  }}
                >
                  <div className="flex h-full flex-col justify-center">
                    <div className="flex flex-auto flex-col gap-2 p-2">
                      <div className="pb-4">
                        <h3
                          className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading mb-2 p-0`}
                        >
                          Your n8n API Key
                        </h3>
                        <Input
                          aria-label="n8n API Key"
                          type="password"
                          placeholder="Enter your n8n API Key here"
                          value={n8nApiKeyTextbox}
                          onChange={(event) =>
                            setN8nApiKeyTextbox(event.target.value)
                          }
                          disabled
                          className={`mt-4 mb-0.5 text-(--foreground) ${montserrat_paragraph.variable} font-montserratParagraph`}
                          style={{ backgroundColor: 'var(--background)' }}
                        />
                        <p className="mt-1 text-sm text-(--foreground)">
                          We use this to run your workflows. You can find your
                          n8n API Key in your n8n account settings.
                        </p>
                        <div className="pt-2" />
                        <Button
                          onClick={(event) => handleSaveApiKey()}
                          className="rounded-lg bg-(--dashboard-button) text-(--dashboard-button-foreground) hover:bg-(--dashboard-button-hover)"
                          type="submit"
                          disabled
                        >
                          {isLoading ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <div
              // Course files header/background
              className={`mx-auto mt-[2%] items-start rounded-2xl bg-(--background) text-(--foreground) ${cardWidthClasses}`}
              style={{ zIndex: 1 }}
            >
              <div className="flex flex-row justify-between">
                <div className="flex flex-col items-start justify-start">
                  <h3
                    className={`heading-h3 pt-3 pb-3 ${montserrat_paragraph.variable} font-montserratParagraph`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    Your n8n tools
                  </h3>
                </div>
                <div className="flex flex-col items-end justify-center">
                  {/* Can add more buttons here */}
                  {/* <Button className={`${montserrat_paragraph.variable} font-montserratParagraph ${classes.downloadButton}`} rightIcon={isLoading ? <LoadingSpinner size="sm" /> : <IconCloudDownload />}
                    onClick={() => downloadConversationHistory(course_name)}>
                    Download Conversation History
                  </Button> */}
                </div>
              </div>
            </div>

            <N8nWorkflowsTable
              n8nApiKey={n8nApiKey}
              course_name={course_name}
              isEmptyWorkflowTable={isEmptyWorkflowTable}
              sidebarCollapsed={sidebarCollapsed}
            />
          </div>
        </div>
      </main>

      <GlobalFooter />
    </SettingsLayout>
  )
}

export default MakeToolsPage
