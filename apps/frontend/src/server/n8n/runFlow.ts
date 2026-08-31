// Server-only n8n flow runner. Ports Flask WorkflowService.main_flow:
// lock the next execution id, POST the form trigger, poll for the result.

import { eq, sql } from 'drizzle-orm'
import { db } from '~/db/dbClient'
import { n8nWorkflows } from '~/db/schema'
import {
  executeN8nForm,
  formatN8nFormDataForWorkflow,
  getLatestN8nExecutionId,
  getN8nExecutions,
  getN8nFormHook,
  N8nClientError,
} from '~/utils/n8nClient'

const LOCK_TIMEOUT_MS = 300_000
const POLL_TIMEOUT_MS = 300_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function lockFlow(id: number): Promise<string | null> {
  const result = await db.execute(
    sql`select check_and_lock_flows_v2(${id}) as message`,
  )
  const rows = Array.isArray(result) ? result : []
  const message = (rows[0] as { message?: string } | undefined)?.message
  return message ?? null
}

async function unlockFlow(id: number): Promise<void> {
  await db
    .update(n8nWorkflows)
    .set({ is_locked: false })
    .where(eq(n8nWorkflows.latest_workflow_id, id))
}

export async function runN8nFlow(params: {
  apiKey: string
  name: string
  data: unknown
  signal?: AbortSignal
}): Promise<any> {
  const { apiKey, name, data, signal } = params
  if (!apiKey) {
    throw new N8nClientError('api_key is required')
  }

  let id = await getLatestN8nExecutionId(apiKey, signal)
  let lockedMsg = await lockFlow(id)

  if (lockedMsg !== 'Workflow updated') {
    const start = Date.now()
    while (
      lockedMsg === 'Workflow is locked' ||
      lockedMsg === 'id already exists'
    ) {
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        return null
      }
      id = await getLatestN8nExecutionId(apiKey, signal)
      lockedMsg = await lockFlow(id)
      if (lockedMsg === 'Workflow updated') break
    }
    if (lockedMsg !== 'Workflow updated') {
      throw new N8nClientError(`Workflow lock failed: ${lockedMsg}`)
    }
  }

  try {
    const formData = await formatN8nFormDataForWorkflow(
      data,
      apiKey,
      name,
      signal,
    )
    const hookId = await getN8nFormHook(apiKey, name, signal)
    await executeN8nForm(hookId, formData, signal)
  } catch (error) {
    throw error
  } finally {
    await unlockFlow(id)
  }

  const pollStart = Date.now()
  let executions = await getN8nExecutions({
    apiKey,
    limit: 20,
    id: String(id),
    pagination: true,
    signal,
  })
  while (executions === null) {
    if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
      return null
    }
    await sleep(500)
    executions = await getN8nExecutions({
      apiKey,
      limit: 20,
      id: String(id),
      pagination: true,
      signal,
    })
  }

  return executions
}
