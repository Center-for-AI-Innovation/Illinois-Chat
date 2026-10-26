import {
  type ModelMessage,
  type FilePart,
  generateText,
  streamText,
  smoothStream,
} from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { type Conversation } from '~/types/chat'
import {
  type OpenAICompatibleProvider,
  ReasoningCapableModels,
} from '~/utils/modelProviders/LLMProvider'
import { decryptKeyIfNeeded } from '~/utils/crypto'
export const dynamic = 'force-dynamic'

const PROVIDER_NAME = 'openaiCompatible'

/**
 * Reasoning request parameter patterns:
 * - 'reasoning_effort': Groq-style - requires { reasoning_effort: 'medium' } in request body
 * - 'openrouter': OpenRouter-style - requires { reasoning: { effort: 'medium' } } via providerOptions
 * - 'none': No special param needed - provider outputs reasoning by default (Cerebras, Mistral, etc.)
 */
type ReasoningRequestPattern = 'reasoning_effort' | 'openrouter' | 'none'

/**
 * Detect what reasoning request pattern to use based on the base URL
 * Only Groq requires special request parameters, others output reasoning by default
 */
function detectReasoningRequestPattern(
  baseUrl: string,
): ReasoningRequestPattern {
  try {
    const parsedUrl = new URL(baseUrl)
    const hostname = parsedUrl.hostname.toLowerCase()
    // Groq requires reasoning_effort parameter for gpt-oss models
    if (hostname === 'api.groq.com' || hostname.endsWith('.groq.com')) {
      return 'reasoning_effort'
    }
    // OpenRouter uses providerOptions (handled separately in AI SDK)
    if (hostname === 'openrouter.ai' || hostname.endsWith('.openrouter.ai')) {
      return 'openrouter'
    }
  } catch {
    // Invalid URL, fall through to default
  }
  // All other providers output reasoning by default without special params
  return 'none'
}

/**
 * Runs an OpenAI-compatible chat with reasoning token support
 * Supports multiple providers: OpenRouter, DeepSeek, Groq, Cerebras, Mistral, custom
 */
export async function runOpenAICompatibleChat(
  conversation: Conversation,
  openAICompatibleProvider: OpenAICompatibleProvider,
  stream: boolean,
): Promise<Response> {
  try {
    if (!conversation) {
      throw new Error('Conversation is missing')
    }

    if (!openAICompatibleProvider.apiKey) {
      throw new Error('OpenAI-compatible API key is missing')
    }

    if (!openAICompatibleProvider.baseUrl) {
      throw new Error('OpenAI-compatible base URL is missing')
    }

    if (conversation.messages.length === 0) {
      throw new Error('Conversation messages array is empty')
    }

    const isReasoningModel = Array.from(ReasoningCapableModels).some(
      (modelId) =>
        modelId.toLowerCase() === conversation.model.id.toLowerCase(),
    )

    const apiKey = await decryptKeyIfNeeded(openAICompatibleProvider.apiKey)
    const baseUrl = openAICompatibleProvider.baseUrl

    const reasoningPattern = detectReasoningRequestPattern(baseUrl)
    const isOpenRouter = reasoningPattern === 'openrouter'
    // OpenRouter requires lowercase model IDs
    const modelId = isOpenRouter
      ? conversation.model.id.toLowerCase()
      : conversation.model.id

    const provider = createOpenAICompatible({
      name: PROVIDER_NAME,
      baseURL: baseUrl,
      apiKey: apiKey,
      fetch: isReasoningModel ? createReasoningFetchMiddleware() : undefined,
    })

    const model = provider(modelId)

    const commonParams = {
      model: model,
      allowSystemInMessages: true,
      messages: convertConversationToVercelAISDKv3(conversation),
      temperature: conversation.temperature,
      maxOutputTokens: 16384,
      ...(isReasoningModel && {
        providerOptions: {
          [PROVIDER_NAME]: {
            ...(reasoningPattern === 'openrouter' && {
              reasoning: { effort: 'medium' },
            }),
            ...(reasoningPattern === 'reasoning_effort' && {
              reasoningEffort: 'medium',
            }),
          },
        },
      }),
    }

    if (stream) {
      return await handleStreamingResponse(commonParams)
    } else {
      const result = await generateText(commonParams)
      const content =
        isReasoningModel &&
        result.finalStep.reasoningText &&
        !result.text.includes('<think>')
          ? `<think>${result.finalStep.reasoningText}</think>\n${result.text}`
          : result.text
      return Response.json({ choices: [{ message: { content } }] })
    }
  } catch (error) {
    console.error('OpenAI-compatible error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        detailed_error:
          error instanceof Error ? error.toString() : 'Unknown error',
        source: 'OpenAICompatible',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

/**
 * Custom fetch middleware to handle reasoning for multiple providers
 * - Normalizes provider-specific JSON and streaming reasoning fields
 * - Transforms response stream to extract reasoning into <think> tags
 *
 * Response formats handled (all providers):
 * - delta.reasoning (Groq, Cerebras)
 * - delta.reasoning_details[].text (OpenRouter)
 * - delta.reasoning_content (DeepSeek)
 * - delta.content[].type="thinking" (Mistral Magistral)
 */
function createReasoningFetchMiddleware() {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await fetch(input, init)

    // For error responses, throw an error that will propagate to the caller
    if (!response.ok) {
      const errorBody = await response.text()
      let errorMessage = `API error ${response.status}`
      try {
        const json = JSON.parse(errorBody)
        errorMessage = json.error?.message || errorMessage
      } catch {
        /* not JSON */
      }
      const error = new Error(errorMessage)
      ;(error as any).status = response.status
      throw error
    }

    if (!response.body) {
      throw new Error('No response body from API')
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/event-stream')) {
      const data = await response.json()
      const message = data.choices?.[0]?.message
      if (message) {
        let content = ''
        let reasoning = ''
        if (Array.isArray(message.content)) {
          for (const item of message.content) {
            if (item.type === 'thinking' && Array.isArray(item.thinking)) {
              reasoning += item.thinking
                .filter(
                  (thought: { type: string; text?: string }) =>
                    thought.type === 'text',
                )
                .map((thought: { text?: string }) => thought.text || '')
                .join('')
            } else if (item.type === 'text') {
              content += item.text || ''
            }
          }
        } else {
          content = message.content || ''
        }
        if (!reasoning) {
          reasoning = (message.reasoning_details || [])
            .filter(
              (detail: { type: string; text?: string }) =>
                detail.type === 'reasoning.text',
            )
            .map((detail: { text?: string }) => detail.text || '')
            .join('')
          reasoning += message.reasoning || ''
          reasoning += message.reasoning_content || ''
        }
        message.content = content
        message.reasoning_content = reasoning
        delete message.reasoning
      }
      const headers = new Headers(response.headers)
      headers.delete('content-length')
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    // Transform stream to extract reasoning
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    let buffer = ''
    let isThinkingOpen = false
    let hasStartedContent = false
    let modelOutputsThinkTags: boolean | null = null

    const transformedStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              // Process remaining buffer
              if (buffer.trim()) {
                const result = processChunk(buffer)
                if (result.output) {
                  controller.enqueue(encoder.encode(result.output))
                }
              }
              // Close thinking tag if still open
              if (isThinkingOpen) {
                const closeEvent = `data: ${JSON.stringify({ choices: [{ delta: { content: '</think>\n' } }] })}\n\n`
                controller.enqueue(encoder.encode(closeEvent))
              }
              controller.close()
              break
            }

            buffer += decoder.decode(value, { stream: true })

            // Process complete SSE events (split by double newline)
            const parts = buffer.split('\n\n')
            buffer = parts.pop() || ''

            for (const part of parts) {
              if (!part.trim()) continue
              const result = processChunk(part)
              if (result.output) {
                controller.enqueue(encoder.encode(result.output + '\n\n'))
              }
            }
          }
        } catch (error) {
          if (isThinkingOpen) controller.enqueue(encoder.encode('</think>\n'))
          controller.error(error)
        }
      },
    })

    function processChunk(chunk: string): { output: string } {
      const lines = chunk.split('\n')
      let output = ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          output += line + '\n'
          continue
        }

        if (line === 'data: [DONE]') {
          output += 'data: [DONE]'
          continue
        }

        const jsonStr = line.slice(6)
        if (!jsonStr.trim()) continue

        try {
          const data = JSON.parse(jsonStr)
          const delta = data.choices?.[0]?.delta

          if (!delta) {
            output += line + '\n'
            continue
          }

          let reasoningText = ''
          let contentText = ''

          // Extract reasoning from various provider formats:
          // 1. OpenRouter: reasoning_details[].text
          if (
            delta.reasoning_details &&
            Array.isArray(delta.reasoning_details)
          ) {
            for (const detail of delta.reasoning_details) {
              if (detail.type === 'reasoning.text' && detail.text) {
                reasoningText += detail.text
              }
            }
          }
          // 2. Groq/Cerebras: reasoning (simple string)
          if (delta.reasoning && typeof delta.reasoning === 'string') {
            reasoningText += delta.reasoning
          }
          // 3. DeepSeek: reasoning_content
          if (
            delta.reasoning_content &&
            typeof delta.reasoning_content === 'string'
          ) {
            reasoningText += delta.reasoning_content
          }
          // 4. Mistral Magistral: content array with { type: "thinking" } objects
          if (Array.isArray(delta.content)) {
            for (const item of delta.content) {
              if (item.type === 'thinking' && Array.isArray(item.thinking)) {
                for (const thought of item.thinking) {
                  if (thought.type === 'text' && thought.text) {
                    reasoningText += thought.text
                  }
                }
              } else if (item.type === 'text' && item.text) {
                contentText += item.text
              }
            }
          }

          // Handle regular content (string format)
          if (typeof delta.content === 'string' && delta.content) {
            // Check if model outputs <think> tags natively (first chunk)
            if (modelOutputsThinkTags === null) {
              modelOutputsThinkTags = delta.content
                .trimStart()
                .startsWith('<think>')
            }
            // If native tags, pass through unchanged
            if (modelOutputsThinkTags) {
              output += line + '\n'
              continue
            }
            contentText = delta.content
          }

          // Build new content with <think> tags
          let newContent = ''

          if (reasoningText) {
            if (!isThinkingOpen) {
              newContent += '<think>'
              isThinkingOpen = true
            }
            newContent += reasoningText
          }

          if (contentText) {
            if (isThinkingOpen && !hasStartedContent) {
              newContent += '</think>\n'
              isThinkingOpen = false
              hasStartedContent = true
            }
            newContent += contentText
          }

          if (newContent) {
            const newDelta = { ...delta, content: newContent }
            delete newDelta.reasoning
            delete newDelta.reasoning_details
            delete newDelta.reasoning_content
            const newData = {
              ...data,
              choices: [{ ...data.choices[0], delta: newDelta }],
            }
            output += `data: ${JSON.stringify(newData)}\n`
          } else {
            output += line + '\n'
          }
        } catch {
          output += line + '\n'
        }
      }

      return { output: output.trimEnd() }
    }

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}

async function handleStreamingResponse(commonParams: any): Promise<Response> {
  const result = await streamText({
    ...commonParams,
    experimental_transform: [smoothStream({ chunking: 'word' })],
  })

  const encoder = new TextEncoder()
  const iterator = result.stream[Symbol.asyncIterator]()

  // Read first part to catch errors before returning
  const first = await iterator.next()
  if (!first.done && first.value.type === 'error') {
    throw first.value.error
  }

  const stream = new ReadableStream({
    async start(controller) {
      if (!first.done && first.value.type === 'text-delta') {
        controller.enqueue(encoder.encode(first.value.text))
      }
      for await (const part of { [Symbol.asyncIterator]: () => iterator }) {
        if (part.type === 'error') throw part.error
        if (part.type === 'text-delta')
          controller.enqueue(encoder.encode(part.text))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
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

    const isLastUserMessage =
      index === conversation.messages.length - 1 && message.role === 'user'

    if (Array.isArray(message.content)) {
      const contentParts: Array<
        string | FilePart | { type: 'text'; text: string }
      > = []

      message.content.forEach((c) => {
        if (c.type === 'text') {
          const text = isLastUserMessage
            ? message.finalPromtEngineeredMessage || c.text || ''
            : c.text || ''
          if (text) contentParts.push(text)
        } else if (c.type === 'image_url' || c.type === 'tool_image_url') {
          const imageUrl = c.image_url?.url || ''
          if (imageUrl) {
            contentParts.push({
              type: 'file',
              mediaType: 'image',
              data: { type: 'url', url: new URL(imageUrl) },
            })
          }
        } else if (c.type === 'file') {
          contentParts.push(
            `[File: ${c.fileName || 'unknown'} (${c.fileType || 'unknown type'}, ${c.fileSize ? Math.round(c.fileSize / 1024) + 'KB' : 'unknown size'})]`,
          )
        }
      })

      const hasImages = contentParts.some(
        (part) => typeof part === 'object' && part.type === 'file',
      )

      if (hasImages || contentParts.length > 1) {
        const formattedContent: Array<
          { type: 'text'; text: string } | FilePart
        > = []
        contentParts.forEach((part) => {
          if (typeof part === 'string') {
            formattedContent.push({ type: 'text', text: part })
          } else if (part.type === 'file') {
            formattedContent.push(part)
          } else if (part.type === 'text') {
            formattedContent.push(part)
          }
        })
        coreMessages.push({
          role: message.role as 'user' | 'assistant',
          content: formattedContent,
        } as ModelMessage)
      } else {
        const textContent =
          typeof contentParts[0] === 'string'
            ? contentParts[0]
            : contentParts[0]?.type === 'text'
              ? contentParts[0].text
              : ''
        if (textContent) {
          coreMessages.push({
            role: message.role as 'user' | 'assistant',
            content: textContent,
          })
        }
      }
    } else {
      const content = isLastUserMessage
        ? message.finalPromtEngineeredMessage || (message.content as string)
        : (message.content as string)

      coreMessages.push({
        role: message.role as 'user' | 'assistant',
        content: content,
      })
    }
  })

  return coreMessages
}
