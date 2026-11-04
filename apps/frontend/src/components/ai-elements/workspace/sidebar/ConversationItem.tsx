'use client'
import { useState, type KeyboardEvent } from 'react'
import { Check, MessagesSquare, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '@/components/shadcn/lib/utils'
import { type Conversation } from '@/types/chat'

export const CONVERSATION_DRAG_TYPE = 'conversation'

type Mode = 'idle' | 'renaming' | 'deleting'

export interface ConversationItemProps {
  conversation: Conversation
  selected: boolean
  onSelect: (conversation: Conversation) => void
  onRename: (id: string, name: string) => void
  onDelete: (conversation: Conversation) => void
}

const iconButton =
  'inline-flex size-6 items-center justify-center rounded-md text-(--ws-muted) transition-colors hover:bg-(--ws-surface) hover:text-(--ws-heading) focus-visible:ring-2 focus-visible:ring-(--ws-accent) focus-visible:outline-none'

export function ConversationItem({
  conversation,
  selected,
  onSelect,
  onRename,
  onDelete,
}: ConversationItemProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [draft, setDraft] = useState('')
  const name = conversation.name || 'New conversation'

  const confirm = () => {
    if (mode === 'renaming') onRename(conversation.id, draft)
    if (mode === 'deleting') onDelete(conversation)
    setMode('idle')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      confirm()
    } else if (event.key === 'Escape') {
      setMode('idle')
    }
  }

  return (
    <li
      className={cn(
        'group relative flex items-center rounded-lg text-sm transition-colors',
        selected
          ? 'bg-(--ws-sidebar-accent) text-(--ws-sidebar-accent-text)'
          : 'text-(--ws-text) hover:bg-(--ws-sidebar-accent)/60',
      )}
    >
      {mode === 'renaming' ? (
        <label className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1 pr-16 pl-2">
          <Pencil className="size-4 shrink-0 text-(--ws-muted)" />
          <input
            autoFocus
            aria-label="Conversation name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 rounded-md border border-(--ws-input) bg-(--ws-surface) px-2 py-1 text-sm text-(--ws-text) outline-none focus:border-(--ws-heading)"
          />
        </label>
      ) : (
        <button
          type="button"
          data-conversation
          draggable
          aria-current={selected ? 'page' : undefined}
          title={name}
          onClick={() => onSelect(conversation)}
          onDragStart={(event) =>
            event.dataTransfer.setData(
              CONVERSATION_DRAG_TYPE,
              JSON.stringify({ id: conversation.id }),
            )
          }
          className={cn(
            'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-2 text-left focus-visible:ring-2 focus-visible:ring-(--ws-accent) focus-visible:outline-none',
            selected || mode !== 'idle'
              ? 'pr-16'
              : 'pr-3 group-focus-within:pr-16 group-hover:pr-16',
            selected && 'font-medium',
          )}
        >
          {mode === 'deleting' ? (
            <Trash2 className="size-4 shrink-0 text-(--ws-error)" />
          ) : (
            <MessagesSquare
              className={cn(
                'size-4 shrink-0',
                selected
                  ? 'text-(--ws-sidebar-accent-text)'
                  : 'text-(--ws-muted)',
              )}
            />
          )}
          <span className="truncate">
            {mode === 'deleting' ? `Delete “${name}”?` : name}
          </span>
        </button>
      )}

      <div
        className={cn(
          'absolute right-1 items-center gap-0.5',
          selected || mode !== 'idle'
            ? 'flex'
            : 'hidden group-focus-within:flex group-hover:flex',
        )}
      >
        {mode === 'idle' ? (
          <>
            <button
              type="button"
              aria-label={`Rename ${name}`}
              className={iconButton}
              onClick={() => {
                setDraft(conversation.name)
                setMode('renaming')
              }}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${name}`}
              className={cn(iconButton, 'hover:text-(--ws-error)')}
              onClick={() => setMode('deleting')}
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label={mode === 'deleting' ? 'Confirm delete' : 'Save name'}
              className={iconButton}
              onClick={confirm}
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Cancel"
              className={iconButton}
              onClick={() => setMode('idle')}
            >
              <X className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </li>
  )
}
