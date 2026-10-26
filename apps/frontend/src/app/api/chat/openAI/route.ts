import {
  createTextStreamResponse,
  toTextStream,
  generateText,
  streamText,
  type ModelMessage,
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { type AuthenticatedRequest } from '~/utils/appRouterAuth'
import { decrypt } from '~/utils/crypto'
import { withCourseAccessFromRequest } from '~/app/api/authorization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

async function handler(req: AuthenticatedRequest): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          error:
            'No authorization header found. Please ensure you have added your OpenAI API key on the LLM page in your course settings.',
        },
        { status: 401 },
      )
    }

    let apiKey = authHeader.substring(7)
    const { messages, model = 'gpt-5.4-mini', stream = true } = await req.json()

    if (
      !apiKey ||
      apiKey === 'undefined' ||
      apiKey === process.env.VLADS_OPENAI_KEY
    ) {
      return NextResponse.json(
        {
          error:
            'Please add your OpenAI API key on the LLM page in your course settings.',
        },
        { status: 401 },
      )
    }

    if (!apiKey.startsWith('sk-')) {
      try {
        apiKey = (await decrypt(
          apiKey,
          process.env.NEXT_PUBLIC_SIGNING_KEY as string,
        )) as string

        if (apiKey === process.env.VLADS_OPENAI_KEY) {
          return NextResponse.json(
            {
              error:
                'Please add your OpenAI API key on the LLM page in your course settings.',
            },
            { status: 401 },
          )
        }
      } catch (error) {
        console.error('Error decrypting OpenAI key:', error)
        return NextResponse.json(
          {
            error:
              'Invalid API key format. Please ensure you have entered a valid OpenAI API key on the LLM page in your course settings.',
          },
          { status: 401 },
        )
      }
    }

    if (!apiKey.startsWith('sk-')) {
      return NextResponse.json(
        {
          error:
            'Invalid API key format. OpenAI API keys should start with "sk-". Please check the LLM page in your course settings.',
        },
        { status: 401 },
      )
    }

    const openAIClient = createOpenAI({
      apiKey,
      baseURL: 'https://api.openai.com/v1', // Default OpenAI API URL
    })

    const openAIModel = openAIClient.chat(model)

    const commonParams = {
      model: openAIModel,
      allowSystemInMessages: true,
      messages: messages as ModelMessage[],
      temperature: 0.7, // You might want to make this configurable
      maxOutputTokens: 8192,
    }

    if (stream) {
      const result = await streamText(commonParams)
      const response = createTextStreamResponse({
        stream: toTextStream({ stream: result.stream }),
      })
      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      })
    } else {
      const result = await generateText(commonParams)
      return NextResponse.json({
        choices: [{ message: { content: result.text } }],
      })
    }
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      const { name, status, headers, message } = error
      return NextResponse.json({ name, status, headers, message }, { status })
    } else {
      throw error
    }
  }
}

export const POST = withCourseAccessFromRequest('any')(handler)
