'use client'
import { useState } from 'react'
import { type ChatStatus, type FileUIPart } from 'ai'
import { ArrowUp, Paperclip, Square } from 'lucide-react'
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from '@/components/ai-elements/prompt-input'
import { cn } from '@/components/shadcn/lib/utils'
import { type WorkspaceMetadata } from '@/types/workspace'
import {
  DocumentsMenu,
  ModelSettingsMenu,
  ToolsMenu,
  type DocumentsMenuProps,
  type ModelSettingsMenuProps,
  type ToolsMenuProps,
} from './ComposerMenus'
import { ContextMeter } from './ContextMeter'
import { ModelPicker } from './ModelPicker'
import { QueueTray, type QueuedMessage } from './QueueTray'
import { fillButton, ghostButton } from './theme'

export type { Effort } from './ComposerMenus'

export interface WorkspaceModel {
  id: string
  name: string
  provider: string
  contextWindow?: number
}

export interface ComposerProps {
  status: ChatStatus
  error?: string
  models: WorkspaceModel[]
  modelId: string
  documents?: DocumentsMenuProps
  tools?: ToolsMenuProps
  settings: Omit<ModelSettingsMenuProps, 'disabled'>
  queue: QueuedMessage[]
  contextTokens?: number
  usage?: WorkspaceMetadata['usage']
  onSubmit: (message: { text: string; files: FileUIPart[] }) => void
  onStop: () => void
  onRetry: () => void
  onRemoveQueued: (id: string) => void
  onModelChange: (value: string) => void
}

const MAX_FILE_BYTES = 20 * 1024 * 1024

export function Composer(props: ComposerProps) {
  const controller = usePromptInputController()
  const [fileError, setFileError] = useState('')
  const busy = props.status === 'streaming' || props.status === 'submitted'
  const selected = props.models.find((m) => m.id === props.modelId)
  const hasDraft =
    controller.textInput.value.trim().length > 0 ||
    controller.attachments.files.length > 0
  const error = props.error || fileError
  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-6 sm:pb-5">
      <QueueTray queue={props.queue} onRemove={props.onRemoveQueued} />
      {error && (
        <div
          role="alert"
          className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-(--ws-accent) bg-(--ws-surface) px-3 py-2 text-sm text-(--ws-text)"
        >
          <span>{error}</span>
          {props.error && (
            <button
              type="button"
              onClick={props.onRetry}
              disabled={busy}
              className="shrink-0 font-semibold text-(--ws-link) hover:text-(--ws-accent) disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </div>
      )}
      <PromptInput
        accept="image/*,application/pdf"
        multiple
        maxFiles={5}
        maxFileSize={MAX_FILE_BYTES}
        onError={(issue) => setFileError(issue.message)}
        onSubmit={(message) => {
          setFileError('')
          if (!props.modelId || (!message.text.trim() && !message.files.length))
            return
          props.onSubmit({ text: message.text.trim(), files: message.files })
        }}
        className="[&_[data-slot=input-group]]:rounded-[14px] [&_[data-slot=input-group]]:border-(--ws-input) [&_[data-slot=input-group]]:bg-(--ws-surface) [&_[data-slot=input-group]]:shadow-sm [&_[data-slot=input-group]]:transition-[border-color,box-shadow]"
      >
        <PromptInputAttachments className="px-3 pt-3 pb-0">
          {(file) => (
            <PromptInputAttachment
              data={file}
              className="border-(--ws-line) text-(--ws-text)"
            />
          )}
        </PromptInputAttachments>
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message input"
            placeholder={
              busy
                ? 'Add a follow-up. It sends when this reply finishes.'
                : 'Ask a question, explore an idea, or start a draft'
            }
            className="min-h-14 px-4 pt-4 text-base leading-7 text-(--ws-text) placeholder:text-(--ws-muted)"
          />
        </PromptInputBody>
        <PromptInputFooter className="@container/composer flex-nowrap gap-1.5 px-2.5 pb-2.5">
          <PromptInputTools className="min-w-0 gap-1.5">
            <PromptInputButton
              aria-label="Attach images or PDFs"
              title="Attach images or PDFs"
              onClick={controller.attachments.openFileDialog}
              className={cn(ghostButton, 'size-9 shrink-0')}
            >
              <Paperclip className="size-4" />
            </PromptInputButton>
            {props.documents && <DocumentsMenu {...props.documents} />}
            {props.tools && props.tools.tools.length > 0 && (
              <ToolsMenu {...props.tools} />
            )}
            <ModelSettingsMenu {...props.settings} disabled={busy} />
          </PromptInputTools>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {selected?.contextWindow ? (
              <ContextMeter
                usedTokens={props.contextTokens ?? 0}
                maxTokens={selected.contextWindow}
                usage={props.usage}
              />
            ) : null}
            <ModelPicker
              value={props.modelId}
              models={props.models}
              disabled={busy}
              onChange={props.onModelChange}
            />
            {busy && (
              <PromptInputButton
                aria-label="Stop response"
                onClick={props.onStop}
                className={cn(fillButton, 'size-9 shrink-0 rounded-full')}
              >
                <Square className="size-3.5" fill="currentColor" />
              </PromptInputButton>
            )}
            {(!busy || hasDraft) && (
              <PromptInputSubmit
                aria-label={busy ? 'Queue message' : 'Send message'}
                disabled={!props.modelId || !hasDraft}
                className="size-9 shrink-0 rounded-full bg-(--ws-orange) text-(--ws-blue) hover:bg-(--ws-orange) hover:opacity-90 disabled:opacity-40"
              >
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </PromptInputSubmit>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-(--ws-muted) sm:justify-between">
        <span>AI can make mistakes. Check important information.</span>
        <span className="hidden sm:inline">
          <kbd className="font-wsBody font-semibold">↵</kbd> to send ·{' '}
          <kbd className="font-wsBody font-semibold">⇧ ↵</kbd> for a new line
        </span>
      </div>
    </div>
  )
}
