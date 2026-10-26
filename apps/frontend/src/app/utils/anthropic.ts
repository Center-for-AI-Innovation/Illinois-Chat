import {
  createTextStreamResponse,
  toTextStream,
  type ModelMessage,
  generateText,
  streamText,
  smoothStream,
} from 'ai'
import { toThinkingTextResponse } from '~/utils/aiStream'
import { type Conversation } from '~/types/chat'
import { createAnthropic } from '@ai-sdk/anthropic'
import {
  type AnthropicProvider,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import { decryptKeyIfNeeded } from '~/utils/crypto'
import { type AnthropicModel } from '~/utils/modelProviders/types/anthropic'
export const dynamic = 'force-dynamic'

/**
 * Runs an Anthropic chat with the given conversation and API provider
 * Handles extended thinking mode if enabled on the selected model
 * Outputs thinking content in <think> tags when streaming and model supports it
 */
export async function runAnthropicChat(
  conversation: Conversation,
  anthropicProvider: AnthropicProvider,
  stream = true,
): Promise<Response> {
  if (!conversation) {
    throw new Error('Conversation is missing')
  }
  if (!anthropicProvider.apiKey) {
    throw new Error('Anthropic API key is missing')
  }
  if (conversation.messages.length === 0) {
    throw new Error('Conversation messages array is empty')
  }

  const anthropic = createAnthropic({
    apiKey: await decryptKeyIfNeeded(anthropicProvider.apiKey),
  })

  if (conversation.messages.length === 0) {
    throw new Error('Conversation messages array is empty')
  }

  // Check if the model is an Anthropic model and has extended thinking enabled
  const isAnthropicModelWithThinking =
    conversation.model &&
    'extendedThinking' in conversation.model &&
    (conversation.model as AnthropicModel).extendedThinking === true

  // Remove the -thinking suffix for the actual API call
  const modelId = isAnthropicModelWithThinking
    ? conversation.model.id.replace('-thinking', '')
    : conversation.model.id

  const model = anthropic(modelId)

  // Common parameters for both streaming and non-streaming requests
  const commonParams = {
    model: model,
    allowSystemInMessages: true,
    messages: convertConversationToVercelAISDKv3(conversation),
    temperature: conversation.temperature,
    maxOutputTokens: 4096,
    ...(isAnthropicModelWithThinking && {
      providerOptions: {
        anthropic: {
          thinking: {
            type: 'enabled' as const,
            budgetTokens: 16000,
          },
        },
      },
    }),
  }

  if (stream) {
    return handleStreamingResponse(commonParams, isAnthropicModelWithThinking)
  } else {
    return handleNonStreamingResponse(
      commonParams,
      isAnthropicModelWithThinking,
    )
  }
}

/**
 * Handles streaming response with thinking content processing
 */
async function handleStreamingResponse(
  commonParams: any,
  isThinkingEnabled: boolean,
): Promise<Response> {
  const result = await streamText({
    ...commonParams,
    experimental_transform: [
      smoothStream({
        chunking: 'word',
      }),
    ],
  })

  if (!isThinkingEnabled) {
    return createTextStreamResponse({
      stream: toTextStream({ stream: result.stream }),
    })
  }

  return toThinkingTextResponse(result)
}

/**
 * Handles non-streaming (regular) response
 */
async function handleNonStreamingResponse(
  commonParams: any,
  isThinkingEnabled: boolean,
): Promise<Response> {
  if (isThinkingEnabled) {
    const {
      text,
      finalStep: { reasoningText },
    } = await generateText({
      ...commonParams,
    })

    // Format the response with reasoning wrapped in <think> tags at the beginning
    const formattedContent = reasoningText
      ? `<think>${reasoningText}</think>\n${text}`
      : text

    return new Response(
      JSON.stringify({ choices: [{ message: { content: formattedContent } }] }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const result = await generateText({
    ...commonParams,
  })

  return new Response(
    JSON.stringify({ choices: [{ message: { content: result.text } }] }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

/**
 * Converts our conversation format to the format expected by Vercel AI SDK v3
 */
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
      // Handle both text and file content
      const textParts: string[] = []

      message.content.forEach((c) => {
        if (c.type === 'text') {
          textParts.push(c.text || '')
        } else if (c.type === 'file') {
          // Convert file content to text representation for Anthropic
          textParts.push(
            `[File: ${c.fileName || 'unknown'} (${c.fileType || 'unknown type'}, ${c.fileSize ? Math.round(c.fileSize / 1024) + 'KB' : 'unknown size'})]`,
          )
        }
      })

      content = textParts.join('\n')
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
