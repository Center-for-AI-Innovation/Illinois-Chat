import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import { bundledLanguages, type BundledLanguage } from 'shiki'
import {
  artifactInputSchema,
  searchOutputSchema,
  type ArtifactInput,
  workspaceMetadataSchema,
  type WorkspaceArtifact,
  type WorkspaceMetadata,
  type WorkspaceSource,
} from '@/types/workspace'

type Part = UIMessage['parts'][number]
export type ToolPart = Extract<Part, { toolCallId: string }>

export function safeUrl(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? value
      : undefined
  } catch {
    return undefined
  }
}

export function toolPart(part: Part): ToolPart | undefined {
  return isToolUIPart(part) ? part : undefined
}

export function toolName(part: ToolPart) {
  return getToolName(part)
}

export function isRunning(part: ToolPart) {
  return part.state === 'input-streaming' || part.state === 'input-available'
}

export function messageMetadata(message: UIMessage): WorkspaceMetadata {
  const parsed = workspaceMetadataSchema.safeParse(message.metadata)
  return parsed.success ? parsed.data : {}
}

export function searchSources(part: ToolPart): WorkspaceSource[] {
  if (part.state !== 'output-available') return []
  const parsed = searchOutputSchema.safeParse(part.output)
  return parsed.success ? parsed.data.sources : []
}

/** Sources cited in a message, deduplicated by URL. */
export function messageSources(message: UIMessage) {
  const sources: { title: string; url: string }[] = []
  for (const part of message.parts) {
    if (part.type === 'source-url') {
      sources.push({ title: part.title || part.url, url: part.url })
      continue
    }
    const tool = toolPart(part)
    if (tool && toolName(tool) === 'searchDocuments')
      for (const source of searchSources(tool)) {
        const url = safeUrl(source.url)
        if (url) sources.push({ title: source.title, url })
      }
  }
  return sources.filter(
    (source, index) =>
      safeUrl(source.url) &&
      sources.findIndex((other) => other.url === source.url) === index,
  )
}

/** Retrieved passages in citation order, including ones with no URL. */
export function citationSources(message: UIMessage): WorkspaceSource[] {
  const sources: WorkspaceSource[] = []
  for (const part of message.parts) {
    const tool = toolPart(part)
    if (tool && toolName(tool) === 'searchDocuments')
      sources.push(...searchSources(tool))
  }
  return sources
}

export function sourceAt(sources: WorkspaceSource[], index: number) {
  return sources.find((source) => source.n === index) ?? sources[index - 1]
}

const CITE_TAG =
  /(?:&lt;cite|<cite)[ \t]{0,100}>([0-9,\s]+)(?:[ \t]{0,100},[ \t]{0,100}p\.[ \t]{0,100}(\d+))?[ \t]{0,100}(?:&lt;\/cite&gt;|<\/cite>)/g

function markdownSafe(value: string) {
  return value.replace(/[[\]()]/g, '')
}

function citationLabel(source: WorkspaceSource, page?: string) {
  const shown = page || source.page
  const title = markdownSafe(source.title)
  return shown ? `${title}, p.${shown}` : title
}

/** Turns <cite>n</cite> tags into markdown links the answer renderer can show. */
export function expandCitations(text: string, sources: WorkspaceSource[]) {
  if (!sources.length || !text.includes('cite')) return text
  CITE_TAG.lastIndex = 0
  return text.replace(CITE_TAG, (original, indices: string, page?: string) => {
    const cited = indices
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .flatMap((index) => {
        const source = sourceAt(sources, index)
        return source ? [{ index, source }] : []
      })
    if (!cited.length) return original
    return cited
      .map(({ index, source }) => {
        const label = citationLabel(
          source,
          cited.length === 1 ? page : undefined,
        )
        const url = safeUrl(source.url)
        const shown = cited.length === 1 ? page || source.page : source.page
        const href = url
          ? `${url}${shown ? `#page=${shown}` : ''}`
          : `#cite-${index}`
        return `[${label}](${href} "Citation ${index}")`
      })
      .join('; ')
  })
}

/** Streaming tool input arrives as partial JSON, so a half-written field must not hide the rest. */
function partialArtifactInput(value: unknown): Partial<ArtifactInput> {
  if (!value || typeof value !== 'object') return {}
  const shape = artifactInputSchema.shape
  return Object.fromEntries(
    (Object.keys(shape) as (keyof ArtifactInput)[]).flatMap((key) => {
      const parsed = shape[key].safeParse(
        (value as Record<string, unknown>)[key],
      )
      return parsed.success && parsed.data !== undefined
        ? [[key, parsed.data]]
        : []
    }),
  )
}

/** Artifacts across the conversation, including ones still streaming. */
export function collectArtifacts(messages: UIMessage[]): WorkspaceArtifact[] {
  const artifacts: WorkspaceArtifact[] = []
  for (const message of messages)
    for (const part of message.parts) {
      const tool = toolPart(part)
      if (!tool || toolName(tool) !== 'createArtifact') continue
      const input = partialArtifactInput(tool.input)
      if (!input.title) continue
      artifacts.push({
        id: tool.toolCallId,
        title: input.title,
        kind: input.kind ?? 'document',
        language: input.language,
        content: input.content ?? '',
        streaming: tool.state === 'input-streaming',
      })
    }
  return artifacts
}

function isBundledLanguage(value: string): value is BundledLanguage {
  return value in bundledLanguages
}

export function codeLanguage(language: string | undefined): BundledLanguage {
  const normalized = language?.toLowerCase() ?? ''
  return isBundledLanguage(normalized) ? normalized : 'markdown'
}

export function artifactFilename(artifact: WorkspaceArtifact) {
  const base =
    artifact.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'artifact'
  if (artifact.kind === 'html') return `${base}.html`
  if (artifact.kind === 'document') return `${base}.md`
  const extensions: Record<string, string> = {
    python: 'py',
    javascript: 'js',
    typescript: 'ts',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    rust: 'rs',
    go: 'go',
    sql: 'sql',
    r: 'r',
    bash: 'sh',
    json: 'json',
  }
  return `${base}.${extensions[artifact.language?.toLowerCase() ?? ''] ?? 'txt'}`
}
