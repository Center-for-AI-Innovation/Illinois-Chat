import { type UIMessage } from 'ai'
import { type Message, type MessageFeedback } from '~/types/chat'
import { type WorkspaceMetadata } from '~/types/workspace'

function metadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>)
    : {}
}

function withFeedback(message: Message): UIMessage['metadata'] {
  if (message.feedback?.isPositive == null) return message.uiMetadata
  return { ...metadataRecord(message.uiMetadata), feedback: message.feedback }
}

// Legacy messages also store regular retrieval results in contexts; only the
// passages from this message's own attachments belong to the upload.
function legacyUploads(message: Message): WorkspaceMetadata['uploads'] {
  if (!Array.isArray(message.content)) return undefined
  const files = message.content.flatMap((content) =>
    content.type === 'file' && content.fileName
      ? [{ name: content.fileName, mediaType: content.fileType }]
      : [],
  )
  if (!files.length) return undefined
  const names = new Set(files.map((file) => file.name))
  const contexts = (message.contexts ?? [])
    .filter(
      (context) =>
        context.conversation_id || names.has(context.readable_filename),
    )
    .map((context) => ({
      title: context.readable_filename,
      text: context.text,
      ...(context.pagenumber && { page: String(context.pagenumber) }),
    }))
  return { files, contexts }
}

export function toWorkspaceMessage(message: Message): UIMessage {
  const uploads = message.uiParts ? undefined : legacyUploads(message)
  const metadata = uploads
    ? { ...metadataRecord(withFeedback(message)), uploads }
    : withFeedback(message)
  if (message.uiParts)
    return {
      id: message.id,
      role: message.role,
      parts: message.uiParts,
      ...(metadata !== undefined && { metadata }),
    }
  const text =
    typeof message.content === 'string'
      ? message.content
      : message.content
          .filter((p) => p.type === 'text')
          .map((p) => p.text || '')
          .join('\n')
  const parts: UIMessage['parts'] = []
  const pattern = /<think>([\s\S]*?)(?:<\/think>|$)/g
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index! > offset)
      parts.push({ type: 'text', text: text.slice(offset, match.index) })
    parts.push({ type: 'reasoning', text: match[1] || '', state: 'done' })
    offset = match.index! + match[0].length
  }
  if (offset < text.length)
    parts.push({ type: 'text', text: text.slice(offset) })
  if (Array.isArray(message.content)) {
    for (const content of message.content) {
      if (content.image_url?.url)
        parts.push({
          type: 'file',
          mediaType: 'image/jpeg',
          url: content.image_url.url,
          filename: content.fileName || 'Image',
        })
    }
  }
  return {
    id: message.id,
    role: message.role,
    parts,
    ...(metadata !== undefined && { metadata }),
  }
}

export function fromWorkspaceMessage(message: UIMessage): Message {
  const feedback = metadataRecord(message.metadata).feedback as
    | MessageFeedback
    | undefined
  return {
    id: message.id,
    role: message.role,
    content: message.parts
      .map((p) =>
        p.type === 'text'
          ? p.text
          : p.type === 'reasoning'
            ? `<think>${p.text}</think>`
            : '',
      )
      .join(''),
    uiParts: message.parts,
    ...(message.metadata !== undefined && { uiMetadata: message.metadata }),
    ...(feedback && { feedback }),
  }
}
