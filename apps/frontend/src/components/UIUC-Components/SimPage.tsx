import {
  IconAlertCircle,
  IconExternalLink,
  IconTrash,
} from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cva } from 'class-variance-authority'
import { useAuth } from 'react-oidc-context'
import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import { useFetchIsSuperAdmin } from '~/hooks/queries/useFetchIsSuperAdmin'
import { type CourseMetadata } from '~/types/courseMetadata'
import { type SimConfigField, type SimWorkflow } from '~/types/sim'
import { type SimWorkflowFailure } from '~/utils/simDiscovery'
import { fetchCourseMetadata } from '~/utils/apiUtils'
import {
  clearCachedSimTools,
  storeDiscoveredSimTools,
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

// Shown under the Save button; `fields` are the inputs the server blamed,
// which are outlined in red.
interface SaveError {
  message: string
  fields: SimConfigField[]
}

const SIM_CONFIG_FIELDS = [
  'sim_api_key',
  'sim_workspace_id',
  'sim_base_url',
] as const satisfies readonly SimConfigField[]

const FORM_ERROR_ID = 'sim-form-error'

const storedKeyVariants = cva('font-mono text-sm', {
  variants: {
    invalid: {
      true: 'text-(--error)',
      false: 'text-(--foreground-faded)',
    },
  },
})

function asSimConfigFields(value: unknown): SimConfigField[] {
  return Array.isArray(value)
    ? SIM_CONFIG_FIELDS.filter((field) => value.includes(field))
    : []
}

function maskKey(key: string): string {
  if (key.length <= 8) return '*'.repeat(key.length)
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
}

const SimPage = ({ course_name }: { course_name: string }) => {
  const router = useRouter()
  const auth = useAuth()
  const { data: isSuperAdmin, isLoading: isSuperAdminLoading } =
    useFetchIsSuperAdmin({ enabled: auth.isAuthenticated })
  const queryClient = useQueryClient()
  const [courseMetadata, setCourseMetadata] = useState<CourseMetadata | null>(
    null,
  )
  const [currentEmail, setCurrentEmail] = useState('')
  // The stored key never reaches the browser — the server sends a masked
  // form, shown read-only. The input is only for a new key, so leaving it
  // empty can never delete the stored one; that takes the Remove button.
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [storedKeyMasked, setStoredKeyMasked] = useState<string | null>(null)
  // Remove takes effect on Save, like every other change in the form.
  const [keyRemoved, setKeyRemoved] = useState(false)
  // Server-reported problem reading the stored key (e.g. rotated master key);
  // shown on the input so the admin knows to enter the key again.
  const [storedKeyError, setStoredKeyError] = useState<string | null>(null)
  const [workspaceIdInput, setWorkspaceIdInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<SaveError | null>(null)
  // Cleared by the next edit, so it never vouches for unsaved changes.
  const [justSaved, setJustSaved] = useState(false)
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

  const showStoredKey = storedKeyMasked !== null && !keyRemoved

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    setJustSaved(false)
    const newKey = apiKeyInput.trim()
    try {
      // The key is sent only when one was typed, or as null when the stored
      // one was removed; otherwise it is omitted and the stored key kept.
      const payload: Record<string, string | null> = {
        course_name,
        sim_workspace_id: workspaceIdInput.trim() || null,
        sim_base_url: baseUrlInput.trim() || null,
      }
      if (newKey) payload.sim_api_key = newKey
      else if (keyRemoved) payload.sim_api_key = null

      const upsertRes = await fetch('/api/UIUC-api/tools/upsertSimConfig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      // `fetch` only rejects on transport failure, so a 4xx/5xx save would
      // otherwise fall through to the success toast below.
      // Nothing was stored, so the form keeps what was typed for correcting.
      if (!upsertRes.ok) {
        const body = (await upsertRes.json().catch(() => ({}))) as {
          error?: string
          fields?: unknown
        }
        setSaveError({
          message: body.error ?? `Save failed with status ${upsertRes.status}`,
          fields: asSimConfigFields(body.fields),
        })
        return
      }

      const { workflows: discovered = [], failed = [] } = (await upsertRes
        .json()
        .catch(() => ({}))) as {
        workflows?: SimWorkflow[]
        failed?: SimWorkflowFailure[]
      }

      const savedKeyMasked = newKey
        ? maskKey(newKey)
        : keyRemoved
          ? null
          : storedKeyMasked
      setHasSavedConfig(Boolean(savedKeyMasked && workspaceIdInput))
      if (newKey || keyRemoved) {
        setStoredKeyMasked(savedKeyMasked)
        setStoredKeyError(null)
        setApiKeyInput('')
        setKeyRemoved(false)
      }
      // The save discovered the workflows with these exact credentials, so
      // show that list rather than asking Sim again. If none could be
      // described, a refetch reports why instead of claiming there are none.
      if (discovered.length === 0 && failed.length > 0) {
        clearCachedSimTools(course_name)
        refetchWorkflows()
      } else {
        await storeDiscoveredSimTools(queryClient, course_name, discovered)
      }

      setJustSaved(true)
    } catch (error) {
      console.error('[SimPage] failed to save Sim config', error)
      setSaveError({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save Sim AI configuration.',
        fields: [],
      })
    } finally {
      setIsSaving(false)
    }
  }

  // One message, under the Save button. A save error replaces the stored-key
  // warning, since it is about what the admin just tried.
  const formError = saveError?.message ?? storedKeyError
  const isFlagged = (field: SimConfigField) =>
    saveError
      ? saveError.fields.includes(field)
      : field === 'sim_api_key' && Boolean(storedKeyError)
  const fieldErrorProps = (field: SimConfigField, descriptionId: string) => ({
    'aria-invalid': isFlagged(field) ? true : undefined,
    'aria-describedby': isFlagged(field)
      ? `${descriptionId} ${FORM_ERROR_ID}`
      : descriptionId,
  })
  const onFieldEdit = (field: SimConfigField) => {
    setJustSaved(false)
    if (saveError?.fields.includes(field)) setSaveError(null)
  }

  if (auth.isLoading || isSuperAdminLoading || !courseMetadata) {
    return <LoadingPlaceholderForAdminPages />
  }

  if (
    courseMetadata &&
    isSuperAdmin !== true &&
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
                          {/* A stored key is plain text, so the label only
                              targets the input shown for a new key. */}
                          <Label
                            htmlFor={showStoredKey ? undefined : 'sim-api-key'}
                          >
                            API Key
                          </Label>
                          <p
                            id="sim-api-key-description"
                            className="text-xs text-(--foreground-faded)"
                          >
                            {showStoredKey
                              ? 'A key is stored. Remove it to enter a different one.'
                              : 'Your Sim AI API key. Found in Settings.'}
                          </p>
                          {showStoredKey ? (
                            <div className="my-2 flex items-center justify-between gap-2">
                              <span
                                className={storedKeyVariants({
                                  invalid: isFlagged('sim_api_key'),
                                })}
                              >
                                {storedKeyMasked}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Remove API key"
                                title="Remove API key"
                                onClick={() => {
                                  setKeyRemoved(true)
                                  onFieldEdit('sim_api_key')
                                }}
                                className="rounded-lg text-(--foreground-faded) hover:text-(--error)"
                              >
                                <IconTrash size={16} aria-hidden="true" />
                              </Button>
                            </div>
                          ) : (
                            <Input
                              id="sim-api-key"
                              type="password"
                              placeholder="sk-sim-..."
                              value={apiKeyInput}
                              onChange={(e) => {
                                setApiKeyInput(e.target.value)
                                onFieldEdit('sim_api_key')
                              }}
                              {...fieldErrorProps(
                                'sim_api_key',
                                'sim-api-key-description',
                              )}
                              className="my-2 bg-(--background) text-(--foreground)"
                            />
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
                            onChange={(e) => {
                              setWorkspaceIdInput(e.target.value)
                              onFieldEdit('sim_workspace_id')
                            }}
                            {...fieldErrorProps(
                              'sim_workspace_id',
                              'sim-workspace-id-description',
                            )}
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
                            onChange={(e) => {
                              setBaseUrlInput(e.target.value)
                              onFieldEdit('sim_base_url')
                            }}
                            {...fieldErrorProps(
                              'sim_base_url',
                              'sim-base-url-description',
                            )}
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
                        {formError && (
                          <p
                            id={FORM_ERROR_ID}
                            role={saveError ? 'alert' : undefined}
                            className={`mt-2.5 text-xs text-(--error) ${montserrat_paragraph.variable} font-montserratParagraph`}
                          >
                            {formError}
                          </p>
                        )}
                        {justSaved && (
                          <p
                            role="status"
                            className={`mt-2.5 text-xs text-(--foreground-faded) ${montserrat_paragraph.variable} font-montserratParagraph`}
                          >
                            Saved.
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
                            {tool.hasAuthoredDescription === false ? (
                              <>
                                {/* Nothing authored, so what the router model
                                    is given is a fallback built from the name
                                    and input fields; label it as such. */}
                                <p className="mt-1 text-xs font-semibold tracking-wide text-(--foreground) uppercase">
                                  Sent to the model instead
                                </p>
                                <p className="line-clamp-2 text-sm text-(--foreground-faded) italic">
                                  {tool.description}
                                </p>
                                <p className="text-xs opacity-60">
                                  The chat model decides when to use a tool from
                                  its description. In Sim, open the workflow,
                                  choose Deploy, then the API tab, then Edit API
                                  Info, and fill in Description. The version,
                                  MCP and chat descriptions are not read.
                                </p>
                              </>
                            ) : (
                              <p className="line-clamp-2 text-sm">
                                {tool.description}
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
