import { randomUUID } from 'node:crypto'
import type { CourseMetadata } from '~/types/courseMetadata'
import type { Conversation } from '~/types/chat'
import { getModels } from '~/pages/api/models'
import { fetchContextsServer } from '~/server/agent/agentServerUtils'
import { buildPrompt } from '~/app/utils/buildPromptUtils'
import { routeModelRequest } from '~/utils/streamProcessing'
import { webLLMModels } from '~/utils/modelProviders/WebLLM'
import {
  type AllLLMProviders,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'

// A leaf RAG agent. It deliberately has no tool-discovery/delegation step,
// so incoming A -> B queries cannot cause B -> A recursion.
export async function answerProjectQuestion(
  project: string,
  question: string,
  asker: string,
  metadata: CourseMetadata,
) {
  const modelsWithProviders = (await getModels(project)) as AllLLMProviders
  const models = Object.values(modelsWithProviders)
    .filter((p) => p.enabled)
    .flatMap((p) => p.models ?? [])
    .filter((m) => m.enabled && !webLLMModels.some((w) => w.id === m.id))
  const activeModel = models.find((m) => m.default) ?? models[0]
  if (!activeModel)
    throw new Error('No server-side model is configured for this NLIP project')
  const contexts = metadata.systemPromptOnly
    ? []
    : await fetchContextsServer({
        courseName: project,
        searchQuery: question,
        docGroups: ['All Documents'],
      })
  const conversation: Conversation = {
    id: randomUUID(),
    name: 'NLIP question',
    model: activeModel,
    messages: [{ id: randomUUID(), role: 'user', content: question, contexts }],
    prompt: metadata.system_prompt ?? '',
    temperature: activeModel.temperature ?? 0.1,
    folderId: null,
    userEmail: asker,
    projectName: project,
  }
  const prepared = await buildPrompt({
    conversation,
    projectName: project,
    courseMetadata: metadata,
  })
  const response: Response = await routeModelRequest({
    conversation: prepared,
    key: modelsWithProviders[ProviderNames.OpenAI]?.apiKey ?? '',
    course_name: project,
    stream: false,
    courseMetadata: metadata,
    llmProviders: modelsWithProviders,
    mode: 'chat',
  })
  if (!response.ok) throw new Error('Project model request failed')
  const body = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[]
  }
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim())
    throw new Error('Project model returned no text answer')
  return {
    text,
    citations: contexts.map((c, i) => ({
      index: i + 1,
      filename: c.readable_filename,
      page: c.pagenumber,
      url: c.url,
    })),
  }
}
