// Direct n8n REST client. Replaces Flask `/getworkflows`, `/run_flow`,
// and `/switch_workflow` proxies. Auth is the per-project API key stored
// on `projects.n8n_api_key`.

const DEFAULT_N8N_URL = 'https://primary-production-1817.up.railway.app'
const GET_TIMEOUT_MS = 8_000
const FORM_TIMEOUT_MS = 60_000

export class N8nUnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'N8nUnauthorizedError'
  }
}

export class N8nClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'N8nClientError'
  }
}

export function getN8nBaseUrl(): string {
  const raw = process.env.N8N_URL || DEFAULT_N8N_URL
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

function n8nHeaders(apiKey: string): HeadersInit {
  return { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' }
}

function requireApiKey(apiKey: string): void {
  if (!apiKey) {
    throw new N8nClientError('api_key is required')
  }
}

async function n8nFetch(
  pathAndQuery: string,
  apiKey: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = GET_TIMEOUT_MS, signal, ...rest } = init
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal?.aborted) {
    controller.abort()
  } else {
    signal?.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const response = await fetch(`${getN8nBaseUrl()}${pathAndQuery}`, {
      ...rest,
      headers: { ...n8nHeaders(apiKey), ...(rest.headers || {}) },
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function readJson(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '')
    throw new N8nClientError(
      `n8n returned ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`,
    )
  }
  return response.json()
}

function throwIfUnauthorized(response: Response, body: any): void {
  if (
    !response.ok &&
    (response.status === 401 ||
      String(body?.message || '').toLowerCase() === 'unauthorized')
  ) {
    throw new N8nUnauthorizedError()
  }
}

export type N8nWorkflowRecord = {
  id: string
  name: string
  active?: boolean
  nodes?: Array<{
    name: string
    type?: string
    parameters?: {
      path?: string
      formFields?: { values?: Array<{ fieldLabel: string }> }
    }
  }>
  [key: string]: unknown
}

export async function getN8nWorkflows(params: {
  apiKey: string
  limit?: number
  pagination?: boolean
  active?: boolean
  workflowName?: string
  signal?: AbortSignal
}): Promise<N8nWorkflowRecord[][] | N8nWorkflowRecord[] | N8nWorkflowRecord> {
  const {
    apiKey,
    limit = 100,
    pagination = true,
    active = false,
    workflowName = '',
    signal,
  } = params
  requireApiKey(apiKey)

  const firstPath = `/api/v1/workflows?limit=${limit}${active ? '&active=true' : ''}`
  const first = await n8nFetch(firstPath, apiKey, { signal })
  const body = await readJson(first)
  throwIfUnauthorized(first, body)
  if (!first.ok) {
    throw new N8nClientError(
      `Failed to fetch n8n workflows: ${first.status} ${first.statusText}`,
    )
  }

  const firstPage: N8nWorkflowRecord[] = Array.isArray(body?.data)
    ? body.data
    : []

  if (!pagination) {
    return firstPage
  }

  const pages: N8nWorkflowRecord[][] = [firstPage]
  let cursor: string | undefined = body?.nextCursor
  while (cursor) {
    const path = `/api/v1/workflows?limit=${limit}&cursor=${encodeURIComponent(cursor)}`
    const next = await n8nFetch(path, apiKey, { signal })
    const nextBody = await readJson(next)
    throwIfUnauthorized(next, nextBody)
    if (!next.ok) {
      throw new N8nClientError(
        `Failed to fetch n8n workflows: ${next.status} ${next.statusText}`,
      )
    }
    pages.push(Array.isArray(nextBody?.data) ? nextBody.data : [])
    cursor = nextBody?.nextCursor
  }

  if (workflowName) {
    const match = pages[0]?.find((workflow) => workflow.name === workflowName)
    if (!match) {
      throw new N8nClientError('Workflow not found')
    }
    return match
  }

  return pages
}

type N8nExecution = { id: string; [key: string]: unknown }

export async function getN8nExecutions(params: {
  apiKey: string
  limit: number
  id?: string
  pagination?: boolean
  signal?: AbortSignal
}): Promise<N8nExecution[] | N8nExecution[][] | N8nExecution | null> {
  const { apiKey, limit, id, pagination = true, signal } = params
  requireApiKey(apiKey)

  const first = await n8nFetch(
    `/api/v1/executions?includeData=true&limit=${limit}`,
    apiKey,
    { signal },
  )
  const body = await readJson(first)
  throwIfUnauthorized(first, body)
  if (!first.ok) {
    throw new N8nClientError(
      `Failed to fetch n8n executions: ${first.status} ${first.statusText}`,
    )
  }

  const firstPage: N8nExecution[] = Array.isArray(body?.data) ? body.data : []

  if (!pagination) {
    if (id) {
      return firstPage.find((execution) => execution.id === id) ?? null
    }
    return firstPage
  }

  const pages: N8nExecution[][] = [firstPage]
  let cursor: string | undefined = body?.nextCursor
  while (cursor) {
    const next = await n8nFetch(
      `/api/v1/executions?includeData=true&limit=${limit}&cursor=${encodeURIComponent(cursor)}`,
      apiKey,
      { signal },
    )
    const nextBody = await readJson(next)
    throwIfUnauthorized(next, nextBody)
    if (!next.ok) {
      throw new N8nClientError(
        `Failed to fetch n8n executions: ${next.status} ${next.statusText}`,
      )
    }
    pages.push(Array.isArray(nextBody?.data) ? nextBody.data : [])
    cursor = nextBody?.nextCursor

    // Match Flask workflow_service.get_executions: when an id is supplied,
    // inspect the first execution of each collected page and return it (or
    // null) as soon as a cursor page has been fetched.
    if (id) {
      return pages[0]?.[0]?.id === id ? (pages[0][0] ?? null) : null
    }
  }

  if (id) {
    return firstPage.find((execution) => execution.id === id) ?? null
  }
  return pages
}

export async function getLatestN8nExecutionId(
  apiKey: string,
  signal?: AbortSignal,
): Promise<number> {
  const executions = (await getN8nExecutions({
    apiKey,
    limit: 1,
    pagination: false,
    signal,
  })) as N8nExecution[]
  if (!executions?.length || !executions[0]?.id) {
    throw new N8nClientError('No executions found')
  }
  return Number(executions[0].id) + 1
}

export async function switchN8nWorkflow(params: {
  apiKey: string
  id: string
  activate: string
  signal?: AbortSignal
}): Promise<any> {
  const { apiKey, id, activate, signal } = params
  requireApiKey(apiKey)
  const shouldActivate = activate === 'True' || activate === 'true'
  const action = shouldActivate ? 'activate' : 'deactivate'
  const response = await n8nFetch(`/api/v1/workflows/${id}/${action}`, apiKey, {
    method: 'POST',
    signal,
  })
  const body = await readJson(response)
  throwIfUnauthorized(response, body)
  if (!response.ok) {
    throw new N8nClientError(
      body?.message ||
        `Failed to ${action} workflow: ${response.status} ${response.statusText}`,
    )
  }
  return body
}

export async function getN8nFormHook(
  apiKey: string,
  workflowName: string,
  signal?: AbortSignal,
): Promise<string> {
  const workflow = (await getN8nWorkflows({
    apiKey,
    limit: 100,
    workflowName,
    signal,
  })) as N8nWorkflowRecord
  if (workflow && Array.isArray(workflow.nodes)) {
    const trigger = workflow.nodes.find(
      (node) => node.name === 'n8n Form Trigger',
    )
    const path = trigger?.parameters?.path
    if (path) return path
  }
  throw new N8nClientError('No nodes found in the workflow')
}

export function formatN8nFormData(
  inputted: unknown,
  workflow: N8nWorkflowRecord,
): Record<string, string> | undefined {
  try {
    const values =
      workflow.nodes?.find((node) => node.name === 'n8n Form Trigger')
        ?.parameters?.formFields?.values ?? []
    const payload = typeof inputted === 'string' ? JSON.parse(inputted) : inputted
    if (!payload || typeof payload !== 'object') return undefined

    const labelToField: Record<string, string> = {}
    values.forEach((value, index) => {
      labelToField[value.fieldLabel] = `field-${index}`
    })

    const formatted: Record<string, string> = {}
    for (const [key, value] of Object.entries(
      payload as Record<string, unknown>,
    )) {
      const field = labelToField[key]
      if (!field) continue
      formatted[field] = Array.isArray(value) ? JSON.stringify(value) : String(value)
    }
    return formatted
  } catch {
    return undefined
  }
}

export async function executeN8nForm(
  hookPath: string,
  data: Record<string, string> | undefined,
  signal?: AbortSignal,
): Promise<void> {
  const payload = data && Object.keys(data).length > 0 ? data : { 'field-0': '' }
  const form = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    form.append(key, value)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FORM_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (signal?.aborted) {
    controller.abort()
  } else {
    signal?.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const response = await fetch(`${getN8nBaseUrl()}/form/${hookPath}`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new N8nClientError(`Error: ${response.status}`)
    }
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Fetch a workflow by name and format form-trigger fields for execution.
 * Returns undefined when the workflow cannot be loaded or formatted, matching
 * Flask `format_data`'s swallow-and-continue behavior.
 */
export async function formatN8nFormDataForWorkflow(
  inputted: unknown,
  apiKey: string,
  workflowName: string,
  signal?: AbortSignal,
): Promise<Record<string, string> | undefined> {
  try {
    const workflow = (await getN8nWorkflows({
      apiKey,
      limit: 100,
      workflowName,
      signal,
    })) as N8nWorkflowRecord
    return formatN8nFormData(inputted, workflow)
  } catch {
    return undefined
  }
}
