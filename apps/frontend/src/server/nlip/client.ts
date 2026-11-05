import { randomUUID } from 'node:crypto'
import { nlipMessageSchema, nlipText, nlipToken } from '~/types/nlip'
import type { UIUCTool, ToolOutput } from '~/types/chat'
import { readNlipConfig, resolveNlipAgent } from './config'

export const NLIP_TOOL_PREFIX = 'nlip:'

/**
 * A log-safe summary of an error. Raw error objects from HTTP clients can
 * carry request headers (API keys), so only the name, message and low-level
 * cause code are kept.
 */
export function describeNlipError(error: unknown) {
  if (!(error instanceof Error)) return { name: typeof error }
  const cause = (error as { cause?: { code?: unknown } }).cause
  return {
    name: error.name,
    message: error.message,
    ...(typeof cause?.code === 'string' ? { cause: cause.code } : {}),
  }
}
const RESPONSE_LIMIT = 256_000

export async function fetchNlipTools(project: string): Promise<UIUCTool[]> {
  const config = await readNlipConfig(project)
  return config.agents
    .filter((a) => a.enabled)
    .map((a) => ({
      id: `${NLIP_TOOL_PREFIX}${a.id}`,
      name: `ask_nlip_${a.id}`,
      readableName: `Ask ${a.name} (NLIP)`,
      description: a.description,
      courseName: project,
      enabled: true,
      inputParameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'A focused question for this agent. Send only information needed to answer.',
          },
        },
        required: ['question'],
      },
    }))
}

async function readLimitedBody(response: Response) {
  if (!response.body) throw new Error('Empty NLIP response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > RESPONSE_LIMIT) throw new Error('NLIP response exceeds 256 KB')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export async function askNlipAgent(
  project: string,
  id: string,
  question: string,
  signal?: AbortSignal,
): Promise<ToolOutput> {
  if (
    typeof question !== 'string' ||
    !question.trim() ||
    question.length > 16_000
  )
    throw new Error('Question must contain 1–16000 characters')
  const agent = await resolveNlipAgent(project, id)
  const conversation = randomUUID()
  const message = nlipText(question.trim(), conversation)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (agent.credential) headers.Authorization = `Bearer ${agent.credential}`
  const timeout = AbortSignal.timeout(60_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await fetch(agent.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
    redirect: 'error',
    signal: combined,
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`NLIP agent returned HTTP ${response.status}`)
  }
  const parsed = nlipMessageSchema.parse(await readLimitedBody(response))
  const correlation = nlipToken(parsed, 'conversation')
  if (correlation && correlation !== conversation)
    throw new Error('NLIP conversation token does not match the request')
  const parts = [parsed, ...(parsed.submessages ?? [])]
  if (parts.some((p) => p.format === 'error'))
    throw new Error('NLIP agent returned a protocol error')
  // Authorization tokens are never propagated into tool output or events.
  const content = parts
    .filter((p) => p.format === 'text' || p.format === 'structured')
    .map((p) =>
      typeof p.content === 'string' ? p.content : JSON.stringify(p.content),
    )
    .join('\n')
  if (!content)
    throw new Error('NLIP response contains no supported answer content')
  return {
    text: content,
    data: {
      protocol: 'NLIP',
      agentId: id,
      conversation,
    },
  }
}

export async function executeNlipTool(
  tool: UIUCTool,
  project: string,
  signal?: AbortSignal,
): Promise<UIUCTool> {
  try {
    const output = await askNlipAgent(
      project,
      tool.id.slice(NLIP_TOOL_PREFIX.length),
      tool.aiGeneratedArgumentValues?.question as string,
      signal,
    )
    return { ...tool, output, error: undefined }
  } catch (error) {
    console.error('[NLIP] agent request failed', {
      project,
      tool: tool.id,
      error: describeNlipError(error),
    })
    // Avoid echoing upstream bodies/credentials into the browser.
    const message = signal?.aborted
      ? 'NLIP request cancelled'
      : error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
        ? 'NLIP agent timed out'
        : 'NLIP agent request failed; check its configuration and availability'
    return { ...tool, output: undefined, error: message }
  }
}
