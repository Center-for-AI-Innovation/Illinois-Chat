// src/app/api/allNewRoutingChat/route.ts

import { type ChatBody, type Conversation } from '@/types/chat'
import { routeModelRequest } from '~/utils/streamProcessing'
import { buildPrompt } from '~/app/utils/buildPromptUtils'
import { type AuthenticatedRequest } from '~/utils/appRouterAuth'
import {
  getCourseMetadata,
  withCourseAccessFromRequest,
} from '~/app/api/authorization'
import { reconstructConversation } from '@/hooks/__internal__/conversation'
import { persistMessageServer } from '~/pages/api/conversation'
import { getModels } from '~/pages/api/models'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

async function handler(req: AuthenticatedRequest) {
  try {
    const body = await req.json()
    const { conversation, course_name, mode } = body as ChatBody
    // Never trust metadata from the request body: load it server-side so the
    // real system prompt is used and callers cannot forge settings.
    const courseMetadata = await getCourseMetadata(course_name)
    if (!courseMetadata) {
      return new Response(
        JSON.stringify({
          title: 'Project not found',
          message: `Project '${course_name}' does not exist`,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )
    }
    body.courseMetadata = courseMetadata
    const hydratedConversation: Conversation | undefined =
      reconstructConversation(conversation)

    // Build the prompt
    const newConversation = await buildPrompt({
      conversation: hydratedConversation,
      projectName: course_name,
      courseMetadata,
      mode,
    })

    body.conversation = newConversation
    const lastMessage =
      newConversation?.messages?.[newConversation.messages.length - 1]
    if (lastMessage) {
      await persistMessageServer({
        conversation: newConversation,
        message: lastMessage,
        courseName: course_name,
        userIdentifier: newConversation.userEmail ?? '',
      })
    }
    // Get providers from redis store for safe-guarding and validation
    body.llmProviders = await getModels(course_name)
    const result = await routeModelRequest(body as ChatBody)

    return result
  } catch (error) {
    console.error('Error in route handler:', error)

    // For errors that occur before calling routeModelRequest
    return new Response(
      JSON.stringify({
        title: 'LLM Error',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }
}

export const POST = withCourseAccessFromRequest('any')(handler)
