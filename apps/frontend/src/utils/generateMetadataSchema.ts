// Port of `ai_ta_backend.utils.schema_generation.generate_schema_from_project_description`.
// Asks the NCSA-hosted Ollama instance to propose metadata fields for a new
// project, falling back to the default schema when there is no description,
// no Ollama configured, or anything at all goes wrong.

const LLM = process.env.METADATA_SCHEMA_MODEL || 'qwen3:32b'

export const DEFAULT_METADATA_SCHEMA = {
  document_type: { type: 'string' },
  document_title: { type: 'string' },
  author: { type: 'string' },
  creation_date: { type: 'string', format: 'date' },
  keywords: { type: 'array', items: { type: 'string' } },
  category: { type: 'string' },
  summary: { type: 'string' },
} as const

const EXAMPLE_SCHEMA = `
        {
        "document_type": {
            "type": "string",
        },
        "document_title": {
            "type": "string",
        },
        "author": {
            "type": "string",
        },
        "publication_date": {
            "type": "string",
            "format": "date",
        },
        "abstract": {
            "type": "string",
        },
        "keywords": {
            "type": "array",
            "items": {
                "type": "string,"
            }
        },
        "url": {
            "type": "string",
            "format": "uri",
        },
        "language": {
            "type": "string",
        },
        "source": {
            "type": "string",
        },
        "license": {
            "type": "string",
        },
        "category": {
            "type": "string",
        },
        "sub_category": {
            "type": "string",
        }
        "creation_date": {
            "type": "string",
            "format": "date",
        }
        }
        `

function buildPrompt(projectName: string, projectDescription: string): string {
  return (
    `You are an expert in metadata extraction and insight generation.
        You are helping to build a RAG-based chatbot whose name and description are given below.
        Using the name and description, generate possible metadata fields that could be extracted from documents that
        will improve retrieval of documents present in the database. Refer to the example schema below. Return the output
        as a JSON string. Do not include any explanations in the output.

        Name: ${projectName}
        Description: ${projectDescription}
        Example schema:` + EXAMPLE_SCHEMA
  )
}

/**
 * Pull the JSON object out of a raw completion. Handles the two shapes the
 * Flask version dealt with (bare JSON, or JSON inside a ``` fence) plus the
 * `<think>` blocks and ```json language tags that qwen3 actually emits.
 */
export function parseSchemaResponse(raw: string): Record<string, unknown> {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  const fenced = /```([\s\S]*?)```/.exec(text)
  if (fenced?.[1]) {
    text = fenced[1]
      .split('\n')
      .map((line) => line.trim())
      .join('')
      .replace(/^json/i, '')
      .trim()
  }

  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Metadata schema response was not a JSON object')
  }
  return parsed as Record<string, unknown>
}

async function readOllamaStream(body: ReadableStream<Uint8Array>) {
  // Ollama's /api/generate streams newline-delimited JSON. Streaming (rather
  // than stream:false) keeps bytes flowing so a proxy read timeout doesn't
  // kill a long generation — same reason the Flask version streamed.
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''

  const consume = (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line) as { response?: string }
        if (typeof parsed.response === 'string') output += parsed.response
      } catch {
        // Ignore partial/non-JSON lines, matching the Python client's leniency.
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    consume(decoder.decode(value, { stream: true }))
  }
  consume(decoder.decode())
  if (buffer.trim()) consume('\n')

  return output.trim()
}

/**
 * Generate a metadata schema for a new project. Never throws — callers get the
 * default schema on any failure, mirroring the Flask behavior.
 */
export async function generateSchemaFromProjectDescription(
  projectName: string,
  projectDescription: string | null | undefined,
): Promise<Record<string, unknown>> {
  if (!projectDescription) {
    return { ...DEFAULT_METADATA_SCHEMA }
  }

  const baseUrl = (process.env.OLLAMA_SERVER_URL || '').replace(/\/$/, '')
  if (!baseUrl) {
    console.warn(
      'generateSchemaFromProjectDescription: OLLAMA_SERVER_URL is not set; using the default metadata schema',
    )
    return { ...DEFAULT_METADATA_SCHEMA }
  }

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NCSA_HOSTED_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: LLM,
        prompt: buildPrompt(projectName, projectDescription),
        stream: true,
      }),
    })

    if (!response.ok || !response.body) {
      throw new Error(
        `Ollama returned ${response.status} ${response.statusText}`,
      )
    }

    return parseSchemaResponse(await readOllamaStream(response.body))
  } catch (error) {
    console.error(
      'Error in generateSchemaFromProjectDescription; returning default schema:',
      error,
    )
    return { ...DEFAULT_METADATA_SCHEMA }
  }
}
