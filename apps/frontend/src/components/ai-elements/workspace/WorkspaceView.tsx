'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ChatStatus, type FileUIPart, type UIMessage } from 'ai'
import { PanelLeftOpen, RotateCcw, SquarePen } from 'lucide-react'
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from '@/components/ai-elements/checkpoint'
import {
  PromptInputProvider,
  usePromptInputController,
} from '@/components/ai-elements/prompt-input'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'
import { cn } from '@/components/shadcn/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/shadcn/ui/alert-dialog'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/shadcn/ui/message-scroller'
import { Sheet, SheetContent, SheetTitle } from '@/components/shadcn/ui/sheet'
import { ArtifactPanel } from './ArtifactPanel'
import { ArtifactsMenu } from './ArtifactsMenu'
import { Composer, type ComposerProps, type WorkspaceModel } from './Composer'
import { type DocumentsMenuProps, type ToolsMenuProps } from './ComposerMenus'
import { EmptyState, type EmptyStateProps } from './EmptyState'
import { MessageTurn, type MessageTurnProps } from './MessageTurn'
import { type QueuedMessage } from './QueueTray'
import { fillButton, workspaceTheme } from './theme'
import { useWorkspaceShell } from './WorkspaceShell'
import { collectArtifacts, messageMetadata } from './workspaceParts'

export type { Effort, WorkspaceModel } from './Composer'

export interface WorkspaceViewProps {
  conversationId: string
  modelId: string
  models: WorkspaceModel[]
  messages: UIMessage[]
  status: ChatStatus
  error?: string
  welcome: Omit<EmptyStateProps, 'onPick'>
  documents?: DocumentsMenuProps
  tools?: ToolsMenuProps
  settings: ComposerProps['settings']
  onModelChange: (value: string) => void
  onNew: () => void
  onSend: (message: { text: string; files: FileUIPart[] }) => void
  onStop: () => void
  onRetry: () => void
  onApproval?: (id: string, approved: boolean) => void
  onRestore?: (messageId: string) => void
  onEdit?: (messageId: string, text: string) => void
  onFeedback?: MessageTurnProps['onFeedback']
}

const floatingButton = cn(fillButton, 'pointer-events-auto h-9 px-3 text-sm')

export function WorkspaceView(props: WorkspaceViewProps) {
  return (
    <PromptInputProvider>
      <Workspace {...props} />
    </PromptInputProvider>
  )
}

function useArtifactFocus(
  artifacts: ReturnType<typeof collectArtifacts>,
  conversationId: string,
) {
  const [activeId, setActiveId] = useState<string>()
  const seen = useRef<{ conversationId: string; ids: Set<string> }>(undefined)
  useEffect(() => {
    if (seen.current?.conversationId !== conversationId) {
      seen.current = {
        conversationId,
        ids: new Set(artifacts.filter((a) => !a.streaming).map((a) => a.id)),
      }
      setActiveId(undefined)
    }
    const fresh = artifacts.find((a) => !seen.current?.ids.has(a.id))
    artifacts.forEach((a) => seen.current?.ids.add(a.id))
    if (fresh) setActiveId(fresh.id)
  }, [artifacts, conversationId])
  return [activeId, setActiveId] as const
}

function Workspace(props: WorkspaceViewProps) {
  const controller = usePromptInputController()
  const shell = useWorkspaceShell()
  const wide = useMediaQuery('(min-width: 1280px)')
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const [restoreId, setRestoreId] = useState<string>()
  const busy = props.status === 'streaming' || props.status === 'submitted'
  const empty = props.messages.length === 0
  const artifacts = useMemo(
    () => collectArtifacts(props.messages),
    [props.messages],
  )
  const [activeArtifactId, setActiveArtifactId] = useArtifactFocus(
    artifacts,
    props.conversationId,
  )
  const activeArtifact = artifacts.find((a) => a.id === activeArtifactId)
  const lastAssistant = props.messages.findLast((m) => m.role === 'assistant')
  const { contextTokens, usage } = lastAssistant
    ? messageMetadata(lastAssistant)
    : {}

  const { onNew, onSend } = props
  const startNew = useCallback(() => {
    setQueue([])
    onNew()
  }, [onNew])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        startNew()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [startNew])

  const previousStatus = useRef(props.status)
  useEffect(() => {
    const finished = previousStatus.current !== 'ready'
    previousStatus.current = props.status
    if (props.status !== 'ready' || !finished || !queue.length) return
    const [next, ...rest] = queue
    setQueue(rest)
    onSend({ text: next!.text, files: next!.files })
  }, [props.status, queue, onSend])

  const submit = (message: { text: string; files: FileUIPart[] }) => {
    if (busy) setQueue((q) => [...q, { id: crypto.randomUUID(), ...message }])
    else onSend(message)
  }

  const pick = (example: string) => {
    controller.textInput.setInput(example)
    document
      .querySelector<HTMLTextAreaElement>(
        '.ic-workspace textarea[aria-label="Message input"]',
      )
      ?.focus()
  }

  const artifactPanel = activeArtifact && (
    <ArtifactPanel
      key={activeArtifact.id}
      artifact={activeArtifact}
      onClose={() => setActiveArtifactId(undefined)}
    />
  )

  const sidebarHidden = shell && !shell.sidebarVisible

  return (
    <div
      className={cn(
        workspaceTheme,
        'flex h-full min-h-0 w-full bg-(--ws-surface) text-(--ws-text)',
      )}
    >
      <section
        aria-label="Chat workspace"
        className="relative flex min-w-0 flex-1 flex-col"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 sm:p-3">
          {sidebarHidden ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Show conversations"
                title="Show conversations"
                className={cn(floatingButton, 'w-9 px-0')}
                onClick={shell.showSidebar}
              >
                <PanelLeftOpen className="size-4" />
              </button>
              <button
                type="button"
                aria-label="New chat"
                title="New chat (⌘K)"
                className={cn(floatingButton, 'w-9 px-0')}
                onClick={startNew}
              >
                <SquarePen className="size-4" />
              </button>
            </div>
          ) : (
            <span />
          )}
          {artifacts.length > 0 && !activeArtifact && (
            <ArtifactsMenu
              artifacts={artifacts}
              className={floatingButton}
              onOpen={setActiveArtifactId}
            />
          )}
        </div>

        {empty ? (
          <div className="flex min-h-0 flex-1 [scrollbar-gutter:stable_both-edges] overflow-y-auto pt-10">
            <EmptyState {...props.welcome} onPick={pick} />
          </div>
        ) : (
          <MessageScrollerProvider autoScroll defaultScrollPosition="end">
            <MessageScroller className="min-h-0 flex-1">
              <MessageScrollerViewport aria-label="Conversation messages">
                <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-8 px-4 pt-14 pb-6 sm:px-6 sm:pb-10">
                  {props.messages.map((message, index) => {
                    const last = index === props.messages.length - 1
                    const assistant = message.role === 'assistant'
                    return (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={message.role === 'user'}
                        className="flex flex-col gap-8"
                      >
                        <MessageTurn
                          message={message}
                          running={busy && last && assistant}
                          artifacts={artifacts}
                          activeArtifactId={activeArtifactId}
                          onOpenArtifact={setActiveArtifactId}
                          onApproval={props.onApproval}
                          onEdit={busy ? undefined : props.onEdit}
                          onFeedback={props.onFeedback}
                          onRetry={
                            !busy && last && assistant
                              ? props.onRetry
                              : undefined
                          }
                        />
                        {props.onRestore && assistant && !last && !busy && (
                          <Checkpoint className="-mt-4 text-(--ws-muted) [&_[data-slot=separator]]:bg-(--ws-sidebar-border)">
                            <CheckpointIcon className="size-4 text-(--ws-accent)" />
                            <CheckpointTrigger
                              tooltip="Remove every message after this point"
                              className="h-7 px-2 text-xs text-(--ws-muted) hover:text-(--ws-heading)"
                              onClick={() => setRestoreId(message.id)}
                            >
                              Restore checkpoint
                            </CheckpointTrigger>
                          </Checkpoint>
                        )}
                      </MessageScrollerItem>
                    )
                  })}
                  {props.status === 'submitted' && (
                    <MessageScrollerItem role="status">
                      <Shimmer as="span" className="text-sm">
                        Preparing your response…
                      </Shimmer>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton
                aria-label="Jump to latest message"
                variant="outline"
                className="rounded-full border-0 bg-(--ws-raised) text-(--ws-heading) shadow-md hover:bg-(--ws-fill-hover) hover:text-(--ws-sidebar-accent-text) dark:bg-(--ws-blue)"
              />
            </MessageScroller>
          </MessageScrollerProvider>
        )}

        <Composer
          status={props.status}
          error={props.error}
          models={props.models}
          modelId={props.modelId}
          documents={props.documents}
          tools={props.tools}
          settings={props.settings}
          queue={queue}
          contextTokens={contextTokens}
          usage={usage}
          onSubmit={submit}
          onStop={props.onStop}
          onRetry={props.onRetry}
          onRemoveQueued={(id) => setQueue((q) => q.filter((m) => m.id !== id))}
          onModelChange={props.onModelChange}
        />
      </section>

      {wide && artifactPanel && (
        <aside
          aria-label="Artifact"
          className="flex w-[min(42vw,720px)] shrink-0 flex-col border-l border-(--ws-line)"
        >
          {artifactPanel}
        </aside>
      )}
      <Sheet
        open={!wide && Boolean(activeArtifact)}
        onOpenChange={(open) => !open && setActiveArtifactId(undefined)}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className={cn(
            workspaceTheme,
            'gap-0 p-0 data-[side=right]:w-full sm:data-[side=right]:max-w-xl',
          )}
        >
          <SheetTitle className="sr-only">
            {activeArtifact?.title ?? 'Artifact'}
          </SheetTitle>
          {artifactPanel}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(restoreId)}
        onOpenChange={(open) => !open && setRestoreId(undefined)}
      >
        <AlertDialogContent className={workspaceTheme}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-wsDisplay text-(--ws-heading)">
              Restore this checkpoint?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every message after this point will be permanently removed from
              the conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5"
              onClick={() => {
                if (restoreId) props.onRestore?.(restoreId)
                setRestoreId(undefined)
                setQueue([])
              }}
            >
              <RotateCcw className="size-3.5" />
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
