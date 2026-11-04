'use client'
import { memo, useState, type ReactNode } from 'react'
import { type UIMessage } from 'ai'
import { cn } from '@/components/shadcn/lib/utils'
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation'
import { Image } from '@/components/ai-elements/image'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  Bubble,
  BubbleContent,
  BubbleGroup,
} from '@/components/shadcn/ui/bubble'
import { type MessageFeedback } from '@/types/chat'
import { type WorkspaceArtifact, type WorkspaceSource } from '@/types/workspace'
import { FeedbackDialog } from './FeedbackDialog'
import { workspaceMarkdownPlugins } from './markdownPlugins'
import { RichPart } from './RichPart'
import { ArtifactChip, PlanCard, SearchTask, ToolCall } from './ToolParts'
import {
  citationSources,
  expandCitations,
  messageMetadata,
  messageSources,
  safeUrl,
  sourceAt,
  toolName,
  toolPart,
  type ToolPart,
} from './workspaceParts'

const proseClassName =
  'text-base leading-7 text-(--ws-text) [&_h1]:font-wsDisplay [&_h2]:font-wsDisplay [&_h3]:font-wsDisplay [&_h1]:text-(--ws-heading) [&_h2]:text-(--ws-heading) [&_h3]:text-(--ws-heading) [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_blockquote]:border-(--ws-orange) [&_blockquote]:font-wsSerif [&_blockquote]:text-(--ws-text) [&_strong]:text-(--ws-heading) [&_table]:text-sm [&_[data-streamdown=inline-code]]:bg-(--ws-sidebar-accent) [&_[data-streamdown=inline-code]]:text-(--ws-sidebar-accent-text) [&_:is([data-streamdown=code-block],[data-streamdown=mermaid-block],[data-streamdown=table-wrapper])]:rounded-xl [&_[data-streamdown=table-wrapper]]:border-(--ws-sidebar-border) [&_:is([data-streamdown=code-block],[data-streamdown=mermaid-block])]:border-0 [&_:is([data-streamdown=code-block],[data-streamdown=mermaid-block])]:bg-(--ws-fill) [&_[data-streamdown=code-block-header]]:bg-transparent [&_[data-streamdown=code-block-header]]:-mx-2 [&_[data-streamdown=code-block-header]]:border-b [&_[data-streamdown=code-block-header]]:border-(--ws-sidebar-border) [&_[data-streamdown=code-block-header]]:px-2 [&_[data-streamdown=code-block-header]]:-mt-2 [&_[data-streamdown=code-block-header]]:h-10 [&_[data-streamdown=code-block]>.absolute]:top-0 [&_[data-streamdown=code-block]>.absolute]:h-10 [&_[data-streamdown=code-block-actions]]:border-0 [&_[data-streamdown=code-block-actions]]:bg-transparent [&_[data-streamdown=code-block-actions]]:p-0 [&_[data-streamdown=code-block-actions]]:backdrop-blur-none [&_[data-streamdown=code-block-body]]:border-0 [&_[data-streamdown=code-block-body]]:bg-transparent! [&_[data-streamdown=code-block-body]_pre]:bg-transparent! [&_[data-streamdown=table-header]]:bg-(--ws-sidebar)'

const APPROVAL_STATES = new Set([
  'approval-requested',
  'approval-responded',
  'output-denied',
])

function dataImage(url: string, mediaType: string) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(url)
  return match && mediaType.startsWith('image/')
    ? { base64: match[2]!, mediaType: match[1]! }
    : undefined
}

export interface MessageTurnProps {
  message: UIMessage
  running?: boolean
  artifacts: WorkspaceArtifact[]
  activeArtifactId?: string
  onRetry?: () => void
  onApproval?: (id: string, approved: boolean) => void
  onOpenArtifact: (id: string) => void
  onEdit?: (messageId: string, text: string) => void
  onFeedback?: (messageId: string, feedback: MessageFeedback | null) => void
}

const lineFadeIn =
  'motion-safe:[&>*]:animate-[ws-line-in_420ms_cubic-bezier(0.22,1,0.36,1)] motion-safe:[&_li]:animate-[ws-line-in_420ms_cubic-bezier(0.22,1,0.36,1)]'

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return [copied, copy] as const
}

function UserMessageEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: string
  onCancel: () => void
  onSave: (text: string) => void
}) {
  const [draft, setDraft] = useState(initial)
  const save = () => draft.trim() && onSave(draft.trim())
  return (
    <div
      data-ws-field
      className="ml-auto w-full max-w-[90%] rounded-2xl border border-(--ws-line) bg-(--ws-surface) p-3 transition-[border-color,box-shadow] sm:max-w-[80%]"
    >
      <textarea
        autoFocus
        aria-label="Edit message"
        value={draft}
        rows={Math.min(8, Math.max(2, draft.split('\n').length))}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            save()
          }
        }}
        className="w-full resize-none bg-transparent px-1 text-base leading-7 text-(--ws-text) outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg px-3 text-sm text-(--ws-muted) transition-colors hover:bg-(--ws-sidebar) hover:text-(--ws-heading)"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!draft.trim() || draft.trim() === initial.trim()}
          className="h-8 rounded-lg bg-(--ws-blue) px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-(--ws-orange) dark:text-(--ws-blue)"
        >
          Send
        </button>
      </div>
    </div>
  )
}

function UserTurn({
  message,
  onEdit,
}: {
  message: UIMessage
  onEdit?: (messageId: string, text: string) => void
}) {
  const [copied, copy] = useCopy()
  const [editing, setEditing] = useState(false)
  const files = [
    ...message.parts.filter((part) => part.type === 'file'),
    ...(messageMetadata(message).uploads?.files ?? []).map((file) => ({
      type: 'file' as const,
      url: '',
      mediaType: file.mediaType || 'application/octet-stream',
      filename: file.name,
    })),
  ]
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
  if (editing && onEdit)
    return (
      <UserMessageEditor
        initial={text}
        onCancel={() => setEditing(false)}
        onSave={(next) => {
          setEditing(false)
          onEdit(message.id, next)
        }}
      />
    )
  return (
    <BubbleGroup aria-label="Your message" className="group items-end">
      {files.length > 0 && (
        <MessageAttachments className="ml-auto">
          {files.map((file, index) => (
            <MessageAttachment
              key={`${file.filename}-${index}`}
              data={file}
              className="size-20 border border-(--ws-line)"
            />
          ))}
        </MessageAttachments>
      )}
      {text && (
        <Bubble
          align="end"
          variant="muted"
          className="max-w-[90%] sm:max-w-[80%]"
        >
          <BubbleContent className="rounded-2xl rounded-br-md border-transparent bg-(--ws-panel)! px-4 py-2.5 text-base leading-7 whitespace-pre-wrap text-(--ws-text) dark:border-(--ws-line)">
            {text}
          </BubbleContent>
        </Bubble>
      )}
      {text && (
        <MessageActions className="-mr-2 justify-end text-(--ws-muted) transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0">
          <MessageAction
            tooltip={copied ? 'Copied' : 'Copy message'}
            onClick={() => void copy(text)}
          >
            {copied ? <Check /> : <Copy />}
          </MessageAction>
          {onEdit && (
            <MessageAction
              tooltip="Edit message"
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </MessageAction>
          )}
        </MessageActions>
      )}
    </BubbleGroup>
  )
}

function citedSource(href: string | undefined, sources: WorkspaceSource[]) {
  const url = safeUrl(href)?.split('#')[0]
  if (url) return sources.find((source) => source.url === url)
  const index = /^#cite-(\d+)$/.exec(href ?? '')?.[1]
  return index ? sourceAt(sources, Number(index)) : undefined
}

function CitationLink({
  href,
  children,
  sources,
}: {
  href?: string
  children?: ReactNode
  sources: WorkspaceSource[]
}) {
  const url = safeUrl(href)
  const source = citedSource(href, sources)
  if (!url)
    return (
      <span className="font-medium text-(--ws-heading)" title={source?.text}>
        {children}
      </span>
    )
  return (
    <InlineCitation>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-(--ws-link) underline underline-offset-2 hover:text-(--ws-accent)"
      >
        {children}
      </a>
      <InlineCitationCard>
        <InlineCitationCardTrigger sources={[url]} />
        <InlineCitationCardBody className="space-y-3 p-4">
          <InlineCitationSource
            title={source?.title || url}
            url={url.split('#')[0]}
            description={source?.text}
          />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-(--ws-link) hover:text-(--ws-accent)"
          >
            Open source <ExternalLink className="size-3" />
          </a>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  )
}

function ToolTurnPart({
  part,
  isLatestPlan,
  running,
  artifacts,
  activeArtifactId,
  onApproval,
  onOpenArtifact,
}: {
  part: ToolPart
  isLatestPlan: boolean
  running: boolean
} & Pick<
  MessageTurnProps,
  'artifacts' | 'activeArtifactId' | 'onApproval' | 'onOpenArtifact'
>) {
  if (APPROVAL_STATES.has(part.state))
    return <ToolCall part={part} onApproval={onApproval} />
  const name = toolName(part)
  if (name === 'searchDocuments') return <SearchTask part={part} />
  if (name === 'updatePlan')
    return isLatestPlan ? <PlanCard part={part} running={running} /> : null
  if (name === 'createArtifact') {
    const artifact = artifacts.find((a) => a.id === part.toolCallId)
    return artifact ? (
      <ArtifactChip
        artifact={artifact}
        active={artifact.id === activeArtifactId}
        onOpen={onOpenArtifact}
      />
    ) : null
  }
  return <ToolCall part={part} onApproval={onApproval} />
}

function ReasoningPart({
  text,
  live,
  streaming,
}: {
  text: string
  live: boolean
  streaming: boolean
}) {
  // Reasoning only auto-collapses while defaultOpen stays true, so it must not
  // flip when a short reply finishes inside the collapse delay.
  const [openOnMount] = useState(live)
  return (
    <Reasoning
      isStreaming={streaming}
      defaultOpen={openOnMount}
      className="mb-0"
    >
      <ReasoningTrigger className="text-(--ws-muted) hover:text-(--ws-heading)" />
      <ReasoningContent className="mt-0 text-sm leading-6 text-(--ws-muted) transition-[height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none [&>*]:mt-4 [&>*]:border-l-2 [&>*]:border-(--ws-line) [&>*]:pl-4">
        {text}
      </ReasoningContent>
    </Reasoning>
  )
}

function AssistantTurn({
  message,
  running,
  artifacts,
  activeArtifactId,
  onRetry,
  onApproval,
  onOpenArtifact,
  onFeedback,
}: MessageTurnProps) {
  const [copied, copy] = useCopy()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const feedback = messageMetadata(message).feedback?.isPositive ?? null
  const sources = citationSources(message)
  const linkedSources = messageSources(message)
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
  const waiting =
    running &&
    !text.trim() &&
    !message.parts.some(
      (part) => part.type === 'reasoning' && part.state === 'streaming',
    )
  const latestPlanId = message.parts
    .map(toolPart)
    .filter((part) => part && toolName(part) === 'updatePlan')
    .at(-1)?.toolCallId
  return (
    <Message from="assistant" className="max-w-full">
      <MessageContent className="w-full gap-3">
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`
          if (part.type === 'reasoning')
            return (
              <ReasoningPart
                key={key}
                text={part.text}
                live={Boolean(running)}
                streaming={Boolean(running && part.state === 'streaming')}
              />
            )
          if (part.type === 'text')
            return (
              <MessageResponse
                key={key}
                className={cn(proseClassName, running && lineFadeIn)}
                plugins={workspaceMarkdownPlugins}
                isAnimating={running}
                linkSafety={{ enabled: false }}
                components={{
                  a: ({ href, children }) => (
                    <CitationLink href={href} sources={sources}>
                      {children}
                    </CitationLink>
                  ),
                }}
              >
                {expandCitations(part.text, sources)}
              </MessageResponse>
            )
          if (part.type === 'file') {
            const image = dataImage(part.url, part.mediaType)
            return image ? (
              <Image
                key={key}
                {...image}
                alt={part.filename || 'Generated image'}
                className="max-h-96 w-auto border border-(--ws-line)"
              />
            ) : (
              <a
                key={key}
                href={safeUrl(part.url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-md border border-(--ws-line) px-3 py-2 text-sm text-(--ws-link)"
              >
                <FileText className="size-4" />
                {part.filename || 'File'}
              </a>
            )
          }
          const tool = toolPart(part)
          if (tool)
            return (
              <ToolTurnPart
                key={key}
                part={tool}
                isLatestPlan={tool.toolCallId === latestPlanId}
                running={Boolean(running)}
                artifacts={artifacts}
                activeArtifactId={activeArtifactId}
                onApproval={onApproval}
                onOpenArtifact={onOpenArtifact}
              />
            )
          if (part.type.startsWith('data-') && 'data' in part)
            return <RichPart key={key} type={part.type} data={part.data} />
          return null
        })}
        {waiting && (
          <Shimmer as="span" className="w-fit text-sm">
            Thinking…
          </Shimmer>
        )}
      </MessageContent>
      {linkedSources.length > 0 && (
        <Sources className="mb-0 text-(--ws-heading)">
          <SourcesTrigger
            count={linkedSources.length}
            className="text-sm text-(--ws-muted) hover:text-(--ws-heading)"
          />
          <SourcesContent>
            {linkedSources.map((source) => (
              <Source
                key={source.url}
                href={source.url}
                title={source.title}
                className="text-(--ws-link) hover:text-(--ws-accent)"
              />
            ))}
          </SourcesContent>
        </Sources>
      )}
      {text && !running && (
        <MessageActions className="-ml-2 text-(--ws-muted)">
          <MessageAction
            tooltip={copied ? 'Copied' : 'Copy response'}
            onClick={() => void copy(text)}
          >
            {copied ? <Check /> : <Copy />}
          </MessageAction>
          {onFeedback && (
            <>
              <MessageAction
                tooltip={
                  feedback === true ? 'Remove good response' : 'Good response'
                }
                aria-pressed={feedback === true}
                className="aria-pressed:text-(--ws-heading)"
                onClick={() =>
                  onFeedback(
                    message.id,
                    feedback === true
                      ? null
                      : { isPositive: true, category: null, details: null },
                  )
                }
              >
                <ThumbsUp fill={feedback === true ? 'currentColor' : 'none'} />
              </MessageAction>
              <MessageAction
                tooltip={
                  feedback === false ? 'Remove bad response' : 'Bad response'
                }
                aria-pressed={feedback === false}
                className="aria-pressed:text-(--ws-heading)"
                onClick={() =>
                  feedback === false
                    ? onFeedback(message.id, null)
                    : setFeedbackOpen(true)
                }
              >
                <ThumbsDown
                  fill={feedback === false ? 'currentColor' : 'none'}
                />
              </MessageAction>
            </>
          )}
          {onRetry && (
            <MessageAction tooltip="Regenerate response" onClick={onRetry}>
              <RotateCcw />
            </MessageAction>
          )}
        </MessageActions>
      )}
      {onFeedback && (
        <FeedbackDialog
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          onSubmit={(category, details) => {
            setFeedbackOpen(false)
            onFeedback(message.id, {
              isPositive: false,
              category,
              details: details || null,
            })
          }}
        />
      )}
    </Message>
  )
}

export const MessageTurn = memo(function MessageTurn(props: MessageTurnProps) {
  return props.message.role === 'user' ? (
    <UserTurn message={props.message} onEdit={props.onEdit} />
  ) : (
    <AssistantTurn {...props} />
  )
})
