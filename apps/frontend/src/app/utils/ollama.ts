import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { type ModelMessage, generateText, streamText } from 'ai'
import { toThinkingTextResponse } from '~/utils/aiStream'
import { type Conversation } from '~/types/chat'
import {
  type NCSAHostedProvider,
  type OllamaProvider,
} from '~/utils/modelProviders/LLMProvider'
import { OllamaModelIDs } from '~/utils/modelProviders/ollama'
import { decryptKeyIfNeeded } from '~/utils/crypto'
import { NextResponse } from 'next/server'

export async function runOllamaChat(
  conversation: Conversation,
  ollamaProvider: OllamaProvider | NCSAHostedProvider,
  stream: boolean,
) {
  try {
    if (!ollamaProvider.baseUrl || ollamaProvider.baseUrl === '') {
      ollamaProvider.baseUrl = process.env.OLLAMA_SERVER_URL
    }

    // Check if provider is properly configured
    if (!ollamaProvider.baseUrl) {
      throw new Error(
        'Ollama server URL is not configured. Set it up in the Admin Dashboard, or use a different LLM.',
      )
    }

    const baseUrl = (await decryptKeyIfNeeded(
      ollamaProvider.baseUrl!,
    )) as string
    try {
      const ollama = createOpenAICompatible({
        name: 'ollama',
        baseURL: `${baseUrl.replace(/\/(?:api|v1)\/?$/, '').replace(/\/$/, '')}/v1`,
        apiKey: process.env.NCSA_HOSTED_API_KEY || 'ollama',
      })

      if (conversation.messages.length === 0) {
        throw new Error('Conversation messages array is empty')
      }

      const commonParams = {
        model: ollama(conversation.model.id),
        allowSystemInMessages: true,
        messages: convertConversatonToVercelAISDKv3(conversation),
        temperature: conversation.temperature,
        maxOutputTokens: 4096,
        ...([OllamaModelIDs.GPT_OSS_120B, OllamaModelIDs.GPT_OSS_20B].includes(
          conversation.model.id as OllamaModelIDs,
        ) && { providerOptions: { ollama: { reasoningEffort: 'medium' } } }),
      }

      // The OpenAI endpoint uses the server/model context size (num_ctx).
      if (stream) {
        const result = streamText(commonParams)
        return toThinkingTextResponse(result)
      } else {
        const result = await generateText(commonParams)
        const content = result.finalStep.reasoningText
          ? `<think>${result.finalStep.reasoningText}</think>\n${result.text}`
          : result.text
        return NextResponse.json({ choices: [{ message: { content } }] })
      }
    } catch (apiError) {
      console.error('Ollama API error:', apiError)

      // Handle specific API errors
      if (apiError instanceof Error) {
        if (
          apiError.message.includes('timeout') ||
          apiError.message.includes('ECONNREFUSED') ||
          apiError.message.includes('ECONNRESET')
        ) {
          throw new Error(
            `Ollama server connection failed: ${apiError.message}. Please check if the Ollama server is running.`,
          )
        } else if (
          apiError.message.includes('not found') ||
          apiError.message.includes('404')
        ) {
          throw new Error(
            `Ollama model '${conversation.model.id}' not found on server. Please check if the model is installed.`,
          )
        } else {
          throw apiError // rethrow with original context
        }
      } else {
        throw new Error('Unknown error when connecting to Ollama')
      }
    }
  } catch (error) {
    console.error('Error in runOllamaChat:', error)
    // return error
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error occurred when running Ollama',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

function convertConversatonToVercelAISDKv3(
  conversation: Conversation,
): ModelMessage[] {
  const coreMessages: ModelMessage[] = []

  // Add system message as the first message
  const systemMessage = conversation.messages.findLast(
    (msg) => msg.latestSystemMessage !== undefined,
  )
  if (systemMessage) {
    // console.log(
    //     'Found system message, latestSystemMessage: ',
    //     systemMessage.latestSystemMessage,
    // )
    coreMessages.push({
      role: 'system',
      content: systemMessage.latestSystemMessage || '',
    })
  }

  // Convert other messages
  conversation.messages.forEach((message, index) => {
    if (message.role === 'system') return // Skip system message as it's already added

    let content: string
    if (
      index === conversation.messages.length - 1 &&
      message.role === 'user' &&
      message.finalPromtEngineeredMessage
    ) {
      content = message.finalPromtEngineeredMessage
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
