/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_METADATA_SCHEMA,
  generateSchemaFromProjectDescription,
  parseSchemaResponse,
} from '~/utils/generateMetadataSchema'

function ollamaStream(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ response: chunk })}\n`),
        )
      }
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('parseSchemaResponse', () => {
  it('parses bare JSON', () => {
    expect(parseSchemaResponse('{"a": {"type": "string"}}')).toEqual({
      a: { type: 'string' },
    })
  })

  it('parses JSON inside a fenced block with a language tag', () => {
    const raw = '```json\n{\n  "a": {\n    "type": "string"\n  }\n}\n```'
    expect(parseSchemaResponse(raw)).toEqual({ a: { type: 'string' } })
  })

  it('strips qwen3 <think> blocks before parsing', () => {
    const raw = '<think>hmm, what fields…</think>\n{"a": {"type": "string"}}'
    expect(parseSchemaResponse(raw)).toEqual({ a: { type: 'string' } })
  })

  it('rejects a non-object payload', () => {
    expect(() => parseSchemaResponse('[1, 2]')).toThrow(/not a JSON object/)
  })
})

describe('generateSchemaFromProjectDescription', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('OLLAMA_SERVER_URL', 'http://ollama.example')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns the default schema when there is no description', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      generateSchemaFromProjectDescription('proj', undefined),
    ).resolves.toEqual({ ...DEFAULT_METADATA_SCHEMA })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the default schema when OLLAMA_SERVER_URL is unset', async () => {
    vi.stubEnv('OLLAMA_SERVER_URL', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      generateSchemaFromProjectDescription('proj', 'a description'),
    ).resolves.toEqual({ ...DEFAULT_METADATA_SCHEMA })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('assembles a streamed response and parses the schema', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        ollamaStream(['```json\n{"topic"', ': {"type": "string"}}\n```']),
      )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      generateSchemaFromProjectDescription('proj', 'a description'),
    ).resolves.toEqual({ topic: { type: 'string' } })

    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('http://ollama.example/api/generate')
    const body = JSON.parse(init.body)
    expect(body.stream).toBe(true)
    expect(body.prompt).toContain('Name: proj')
    expect(body.prompt).toContain('Description: a description')
  })

  it('falls back to the default schema on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 500 })),
    )

    await expect(
      generateSchemaFromProjectDescription('proj', 'a description'),
    ).resolves.toEqual({ ...DEFAULT_METADATA_SCHEMA })
  })

  it('falls back to the default schema on unparseable output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ollamaStream(['not json at all'])),
    )

    await expect(
      generateSchemaFromProjectDescription('proj', 'a description'),
    ).resolves.toEqual({ ...DEFAULT_METADATA_SCHEMA })
  })

  it('falls back to the default schema when the request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(
      generateSchemaFromProjectDescription('proj', 'a description'),
    ).resolves.toEqual({ ...DEFAULT_METADATA_SCHEMA })
  })
})
