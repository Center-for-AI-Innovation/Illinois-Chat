import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { type ModelMessage, generateText, streamText } from 'ai'
import { type Conversation } from '~/types/chat'
import { toThinkingTextResponse } from '~/utils/aiStream'

export const dynamic = 'force-dynamic'

function buildVLLMResponseContent({
  content,
  reasoning,
}: {
  content: string
  reasoning?: string | null
}): string {
  const normalizedReasoning = reasoning?.trim()

  if (normalizedReasoning) {
    const normalizedContent = content.trimStart()
    return normalizedContent.length > 0
      ? `<think>${normalizedReasoning}</think>\n\n${normalizedContent}`
      : `<think>${normalizedReasoning}</think>`
  }

  return content.trimStart()
}

export async function runVLLM(conversation: Conversation, stream: boolean) {
  try {
    if (!conversation) {
      throw new Error('Conversation is missing')
    }

    if (conversation.messages.length === 0) {
      throw new Error('Conversation messages array is empty')
    }

    const modelId = conversation.model.id
    const baseUrl = process.env.NCSA_HOSTED_VLM_BASE_URL
    const apiKey = process.env.NCSA_HOSTED_API_KEY || ''

    if (!baseUrl) {
      throw new Error('VLLM server URL is not configured')
    }

    const provider = createOpenAICompatible({
      name: 'vllm',
      baseURL: baseUrl,
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const commonParams = {
      model: provider(modelId),
      allowSystemInMessages: true,
      messages: convertConversationToVercelAISDKv3(conversation),
      temperature: conversation.temperature,
      maxOutputTokens: 8192,
      topP: 0.8,
      providerOptions: { vllm: { repetition_penalty: 1.05 } },
    }

    try {
      if (stream) {
        return toThinkingTextResponse(streamText(commonParams), {
          reasoningSeparator: '\n\n',
          trimStart: true,
        })
      }

      const result = await generateText(commonParams)
      return Response.json({
        choices: [
          {
            message: {
              content: buildVLLMResponseContent({
                content: result.text,
                reasoning: result.finalStep.reasoningText,
              }),
            },
          },
        ],
      })
    } catch (error) {
      console.error('VLLM API error:', error)
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`VLLM request timed out: ${error.message}`)
      } else if (error instanceof Error && error.message.includes('apiKey')) {
        throw new Error(
          `VLLM authentication error: Please check API configuration`,
        )
      } else {
        throw error // rethrow the original error with context
      }
    }
  } catch (error) {
    console.error('Error in runVLLM:', error)
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error occurred when running VLLM',
        detailed_error:
          error instanceof Error ? error.toString() : 'Unknown error',
        source: 'VLLM',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

function convertConversationToVercelAISDKv3(
  conversation: Conversation,
): ModelMessage[] {
  const coreMessages: ModelMessage[] = []

  const systemMessage = conversation.messages.findLast(
    (msg) => msg.latestSystemMessage !== undefined,
  )
  if (systemMessage) {
    coreMessages.push({
      role: 'system',
      content: systemMessage.latestSystemMessage || '',
    })
  }

  conversation.messages.forEach((message, index) => {
    if (message.role === 'system') return

    let content: string
    if (index === conversation.messages.length - 1 && message.role === 'user') {
      content = message.finalPromtEngineeredMessage || ''
    } else if (Array.isArray(message.content)) {
      content = message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
    } else {
      content = message.content as string
    }

    coreMessages.push({
      role: message.role as 'user' | 'assistant',
      content: content,
    })
  })

  return coreMessages
}

export { buildVLLMResponseContent }
