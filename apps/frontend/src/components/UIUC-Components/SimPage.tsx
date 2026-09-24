import { IconAlertCircle, IconExternalLink } from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import { type CourseMetadata } from '~/types/courseMetadata'
import { fetchCourseMetadata } from '~/utils/apiUtils'
import { showToast } from '~/utils/toastUtils'
import {
  clearCachedSimTools,
  useFetchAllWorkflows,
} from '~/utils/functionCalling/handleFunctionCalling'
import { Badge } from '@/components/shadcn/ui/badge'
import { Button } from '@/components/shadcn/ui/button'
import { Card } from '@/components/shadcn/ui/card'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'
import { Input } from '@/components/shadcn/ui/input'
import { Label } from '@/components/shadcn/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/ui/table'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import { CannotEditCourse } from './CannotEditCourse'
import GlobalFooter from './GlobalFooter'
import { LoadingPlaceholderForAdminPages } from './MainPageBackground'

interface ToolRoutingStatus {
  status: 'custom' | 'default' | 'offline'
  provider?: string
  model?: string
  reason?: string
}

function maskKey(key: string): string {
  if (key.length <= 8) return '*'.repeat(key.length)
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
}

const SimPage = ({ course_name }: { course_name: string }) => {
  const router = useRouter()
  const auth = useAuth()
  const [courseMetadata, setCourseMetadata] = useState<CourseMetadata | null>(
    null,
  )
  const [currentEmail, setCurrentEmail] = useState('')
  // The key input holds only what the admin types this session. The stored
  // key never reaches the browser — the server sends a masked form for
  // display, and a blank input on save means "keep the stored key".
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [storedKeyMasked, setStoredKeyMasked] = useState<string | null>(null)
  // Server-reported problem reading the stored key (e.g. rotated master key);
  // shown on the input so the admin knows to enter the key again.
  const [storedKeyError, setStoredKeyError] = useState<string | null>(null)
  const [workspaceIdInput, setWorkspaceIdInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [hasSavedConfig, setHasSavedConfig] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialCollapsedState(),
  )
  const isSmallScreen = useMediaQuery('(max-width: 960px)')
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed)

  const [toolRouting, setToolRouting] = useState<ToolRoutingStatus | null>(null)

  const {
    data: workflows,
    isSuccess,
    isError,
    error: workflowsError,
    refetch: refetchWorkflows,
  } = useFetchAllWorkflows(course_name)

  // Load saved config on mount. The stored project row is the only source of
  // truth — the browser holds no copy of the credentials, so every user of the
  // project gets the same tools rather than only the admin who typed the key.
  useEffect(() => {
    fetch(`/api/UIUC-api/tools/getSimConfig?course_name=${course_name}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          config: {
            has_api_key?: boolean
            sim_api_key_masked?: string | null
            sim_api_key_error?: string | null
            sim_base_url?: string | null
            sim_workspace_id?: string | null
            tool_routing?: ToolRoutingStatus
          } | null,
        ) => {
          if (!config) return
          if (config.tool_routing) setToolRouting(config.tool_routing)
          if (config.sim_api_key_masked)
            setStoredKeyMasked(config.sim_api_key_masked)
          setStoredKeyError(config.sim_api_key_error ?? null)
          if (config.sim_workspace_id)
            setWorkspaceIdInput(config.sim_workspace_id)
          if (config.sim_base_url) setBaseUrlInput(config.sim_base_url)
          setHasSavedConfig(
            Boolean(config.has_api_key && config.sim_workspace_id),
          )
        },
      )
      .catch((error) => {
        console.debug('[SimPage] failed to load Sim config', error)
      })
  }, [course_name])

  // Fetch course metadata + auth
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

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // A blank key input means "keep the stored key" — the field is omitted
      // so the partial update leaves the column alone. The other fields are
      // always visible, so what the form shows is what gets stored.
      const payload: Record<string, string | null> = {
        course_name,
        sim_workspace_id: workspaceIdInput || null,
        sim_base_url: baseUrlInput.trim() || null,
      }
      if (apiKeyInput) payload.sim_api_key = apiKeyInput

      const upsertRes = await fetch('/api/UIUC-api/tools/upsertSimConfig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      // `fetch` only rejects on transport failure, so a 4xx/5xx save would
      // otherwise fall through to the success toast below.
      if (!upsertRes.ok) {
        const body = (await upsertRes.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(
          body.error ?? `Save failed with status ${upsertRes.status}`,
        )
      }

      const hasKey = Boolean(apiKeyInput || storedKeyMasked)
      setHasSavedConfig(Boolean(hasKey && workspaceIdInput))
      if (apiKeyInput) {
        setStoredKeyMasked(maskKey(apiKeyInput))
        setStoredKeyError(null)
        setApiKeyInput('')
      }
      // The credentials just changed, so any tools discovered under the old
      // ones are wrong; drop the cache before refetching.
      clearCachedSimTools(course_name)
      refetchWorkflows()

      showToast({
        title: 'Saved',
        message: 'Sim AI configuration saved successfully.',
        type: 'success',
        autoClose: 5000,
      })
    } catch (error) {
      console.error('[SimPage] failed to save Sim config', error)
      showToast({
        title: 'Error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save Sim AI configuration.',
        type: 'error',
        autoClose: 10000,
      })
    } finally {
      setIsSaving(false)
    }
  }

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
        <title>{course_name} - Sim AI Tools</title>
        <meta
          name="description"
          content="Configure Sim AI tool calling for your project."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="course-page-main flex min-h-screen w-full flex-col items-center">
        <div className="items-left flex w-full flex-col justify-center py-0">
          <div className="flex w-full flex-col items-center">
            {/* Config card */}
            <Card
              className={`mt-[2%] ${cardWidthClasses} gap-0 rounded-4xl border p-0 shadow-none ring-0`}
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--dashboard-border)',
              }}
            >
              <div className="flex flex-col md:flex-row">
                <div className="min-h-full flex-[1_1_100%] bg-(--background) text-(--foreground) md:flex-[1_1_60%]">
                  <div className="m-4 flex flex-wrap items-center gap-4">
                    <h2
                      className={`heading-h2 ${montserrat_heading.variable} font-montserratHeading ml-4`}
                    >
                      LLM Tool Use &amp; Function Calling
                    </h2>
                    <div className="flex w-full flex-col items-start justify-start">
                      <h5
                        className={`heading-h5 ${montserrat_heading.variable} font-montserratHeading ml-4 w-full flex-[1_1_50%] text-left`}
                      >
                        Connect your{' '}
                        <a
                          href="https://www.sim.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-(--dashboard-button) hover:text-(--dashboard-button-hover) ${montserrat_heading.variable} font-montserratHeading`}
                        >
                          Sim AI{' '}
                          <IconExternalLink
                            className="mr-2 inline-block"
                            style={{ position: 'relative', top: '-3px' }}
                          />
                        </a>
                        workspace to enable tool calling. Your deployed
                        workflows will be automatically discovered and available
                        as tools in the chat.
                      </h5>
                    </div>
                  </div>
                </div>

                {/* Right side — config inputs */}
                <div
                  className="flex flex-[1_1_100%] p-4 md:flex-[1_1_40%]"
                  style={{
                    backgroundColor: 'var(--dashboard-sidebar-background)',
                    color: 'var(--dashboard-foreground)',
                    borderLeft: isSmallScreen
                      ? ''
                      : '1px solid var(--dashboard-border)',
                  }}
                >
                  <div className="card flex h-full w-full flex-col justify-center">
                    <div className="card-body p-2">
                      <div className="pb-4">
                        <h3
                          className={`heading-h3 label ${montserrat_heading.variable} font-montserratHeading mb-2 p-0`}
                        >
                          Sim AI Configuration
                        </h3>

                        <div
                          className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                        >
                          <Label htmlFor="sim-api-key">API Key</Label>
                          <p
                            id="sim-api-key-description"
                            className="text-xs text-(--foreground-faded)"
                          >
                            {storedKeyMasked
                              ? 'A key is stored. Leave blank to keep it, or enter a new one to replace it.'
                              : 'Your Sim AI API key (sk-sim-...). Found in Settings → Sim Keys.'}
                          </p>
                          <Input
                            id="sim-api-key"
                            type="password"
                            placeholder={storedKeyMasked ?? 'sk-sim-...'}
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            aria-invalid={storedKeyError ? true : undefined}
                            aria-describedby={
                              storedKeyError
                                ? 'sim-api-key-description sim-api-key-error'
                                : 'sim-api-key-description'
                            }
                            className="my-2 bg-(--background) text-(--foreground)"
                          />
                          {storedKeyError && (
                            <p
                              id="sim-api-key-error"
                              className="text-xs text-(--error)"
                            >
                              {storedKeyError}
                            </p>
                          )}
                        </div>

                        <div className="pt-2" />
                        <div
                          className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                        >
                          <Label htmlFor="sim-workspace-id">Workspace ID</Label>
                          <p
                            id="sim-workspace-id-description"
                            className="text-xs text-(--foreground-faded)"
                          >
                            Your Sim AI workspace ID. Found in your workspace
                            URL or settings.
                          </p>
                          <Input
                            id="sim-workspace-id"
                            placeholder="Enter workspace ID"
                            value={workspaceIdInput}
                            onChange={(e) =>
                              setWorkspaceIdInput(e.target.value)
                            }
                            aria-describedby="sim-workspace-id-description"
                            className="my-2 bg-(--background) text-(--foreground)"
                          />
                        </div>

                        <div className="pt-2" />
                        <div
                          className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                        >
                          <Label htmlFor="sim-base-url">
                            Base URL (optional)
                          </Label>
                          <p
                            id="sim-base-url-description"
                            className="text-xs text-(--foreground-faded)"
                          >
                            Point this project at a self-hosted Sim instance.
                            Leave blank to use the deployment default.
                          </p>
                          <Input
                            id="sim-base-url"
                            placeholder="https://www.sim.ai"
                            value={baseUrlInput}
                            onChange={(e) => setBaseUrlInput(e.target.value)}
                            aria-describedby="sim-base-url-description"
                            className="my-2 bg-(--background) text-(--foreground)"
                          />
                        </div>

                        <div className="pt-3" />
                        <Button
                          type="button"
                          variant="dashboard"
                          onClick={handleSave}
                          className="rounded-lg"
                          disabled={isSaving}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        {storedKeyMasked && (
                          <p
                            className={`mt-2.5 text-xs opacity-60 ${montserrat_paragraph.variable} font-montserratParagraph text-(--foreground)`}
                          >
                            Stored key: {storedKeyMasked}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Discovered workflows table */}
            <div
              className={`mx-auto mt-[2%] items-start rounded-2xl bg-(--background) text-(--foreground) ${cardWidthClasses}`}
              style={{ zIndex: 1 }}
            >
              <div className="flex flex-row items-center justify-between">
                <h3
                  className={`heading-h3 pt-3 pb-3 ${montserrat_paragraph.variable} font-montserratParagraph`}
                >
                  Deployed Sim AI Workflows
                </h3>
                {toolRouting && (
                  <Badge
                    variant={
                      toolRouting.status === 'custom'
                        ? 'default'
                        : toolRouting.status === 'default'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {toolRouting.status === 'custom'
                      ? 'Custom router'
                      : toolRouting.status === 'default'
                        ? 'Default router'
                        : 'Offline'}
                  </Badge>
                )}
              </div>
              {toolRouting && (
                <p className="pb-2 text-sm text-(--foreground-faded)">
                  {toolRouting.status === 'custom'
                    ? toolRouting.provider === 'OpenAICompatible'
                      ? "Tool calls for this provider's models use this project's own AI provider; other models use the Illinois-hosted default."
                      : "Tool calls are routed through this project's own AI provider."
                    : toolRouting.status === 'default'
                      ? `Tool calls are routed through the Illinois-hosted model${
                          toolRouting.model ? ` (${toolRouting.model})` : ''
                        }.`
                      : "Tool calls can't run. Add an OpenAI key or OpenAI-compatible provider on the LLMs page."}
                </p>
              )}
            </div>

            <Card
              className={`${cardWidthClasses} rounded-4xl border shadow-none ring-0`}
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--dashboard-border)',
              }}
            >
              {!hasSavedConfig && (
                <p
                  className={`${montserrat_paragraph.variable} font-montserratParagraph p-4 text-(--foreground) opacity-70`}
                >
                  Enter your Sim AI API Key and Workspace ID above to discover
                  deployed workflows.
                </p>
              )}
              {hasSavedConfig && isError && (
                <p
                  className={`${montserrat_paragraph.variable} font-montserratParagraph p-4 text-(--error)`}
                >
                  {workflowsError instanceof Error && workflowsError.message
                    ? workflowsError.message
                    : 'Failed to load workflows. Check your API key and workspace ID.'}
                </p>
              )}
              {hasSavedConfig &&
                isSuccess &&
                workflows &&
                workflows.length === 0 && (
                  <p
                    className={`${montserrat_paragraph.variable} font-montserratParagraph p-4 text-(--foreground) opacity-70`}
                  >
                    No deployed workflows found. Deploy a workflow in Sim AI to
                    see it here.
                  </p>
                )}
              {hasSavedConfig &&
                isSuccess &&
                workflows &&
                workflows.length > 0 && (
                  <Table
                    aria-label="Deployed Sim AI workflows"
                    className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Input Fields</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workflows.map((tool, index) => (
                        <TableRow
                          key={tool.id}
                          // The shadcn table only draws separators, so the
                          // alternate-row tint is applied here.
                          className={
                            index % 2 === 0
                              ? 'bg-(--background)'
                              : 'bg-(--background-faded)'
                          }
                        >
                          <TableCell className="font-medium">
                            {tool.readableName}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {tool.hasAuthoredDescription === false && (
                              <Badge
                                variant="outline"
                                className="mb-1 gap-1 border-amber-500 text-amber-600"
                              >
                                <IconAlertCircle size={12} aria-hidden="true" />
                                No description in Sim
                              </Badge>
                            )}
                            <p className="line-clamp-2 text-sm">
                              {tool.description}
                            </p>
                            {tool.hasAuthoredDescription === false && (
                              <p className="text-xs opacity-60">
                                The chat model decides when to use a tool from
                                its description. Add one to this workflow in Sim
                                so it gets picked reliably.
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {tool.inputParameters?.required?.map((field) => (
                              <Badge
                                key={field}
                                variant="outline"
                                className="mr-1"
                              >
                                {field}
                              </Badge>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
            </Card>
          </div>
        </div>
      </main>
      <GlobalFooter />
    </SettingsLayout>
  )
}

export default SimPage
