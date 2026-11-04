'use client'
import {
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/components/shadcn/lib/utils'
import { type FolderWithConversation } from '@/types/folder'
import { CONVERSATION_DRAG_TYPE } from './ConversationItem'

type Mode = 'idle' | 'renaming' | 'deleting'

export function readDraggedConversationId(event: DragEvent) {
  try {
    return JSON.parse(event.dataTransfer.getData(CONVERSATION_DRAG_TYPE))
      .id as string
  } catch {
    return undefined
  }
}

export interface FolderItemProps {
  folder: FolderWithConversation
  forceOpen: boolean
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onDropConversation: (conversationId: string, folderId: string) => void
  children: ReactNode
}

const iconButton =
  'inline-flex size-6 items-center justify-center rounded-md text-(--ws-muted) transition-colors hover:bg-(--ws-surface) hover:text-(--ws-heading) focus-visible:ring-2 focus-visible:ring-(--ws-accent) focus-visible:outline-none'

export function FolderItem({
  folder,
  forceOpen,
  onRename,
  onDelete,
  onDropConversation,
  children,
}: FolderItemProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [draft, setDraft] = useState('')
  const [dropping, setDropping] = useState(false)
  const expanded = open || forceOpen
  const count = folder.conversations?.length ?? 0

  const confirm = () => {
    if (mode === 'renaming' && draft.trim()) onRename(folder.id, draft.trim())
    if (mode === 'deleting') onDelete(folder.id)
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
      onDragOver={(event) => {
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDropping(false)
        const id = readDraggedConversationId(event)
        if (id) {
          onDropConversation(id, folder.id)
          setOpen(true)
        }
      }}
      className={cn(
        'rounded-lg transition-colors',
        dropping && 'bg-(--ws-hover) ring-1 ring-(--ws-accent)',
      )}
    >
      <div className="group relative flex items-center rounded-lg text-sm text-(--ws-text) hover:bg-(--ws-sidebar-accent)/60">
        {mode === 'renaming' ? (
          <label className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1 pr-16 pl-2">
            <Folder className="size-4 shrink-0 text-(--ws-muted)" />
            <input
              autoFocus
              aria-label="Folder name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 rounded-md border border-(--ws-input) bg-(--ws-surface) px-2 py-1 text-sm outline-none focus:border-(--ws-heading)"
            />
          </label>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setOpen(!expanded)}
            className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pr-16 pl-2 text-left focus-visible:ring-2 focus-visible:ring-(--ws-accent) focus-visible:outline-none"
          >
            <ChevronRight
              className={cn(
                'size-3.5 shrink-0 text-(--ws-muted) transition-transform',
                expanded && 'rotate-90',
              )}
            />
            {expanded ? (
              <FolderOpen className="size-4 shrink-0 text-(--ws-accent)" />
            ) : (
              <Folder className="size-4 shrink-0 text-(--ws-muted)" />
            )}
            <span className="truncate font-medium">
              {mode === 'deleting' ? `Delete “${folder.name}”?` : folder.name}
            </span>
            {mode === 'idle' && (
              <span className="ml-auto text-xs text-(--ws-muted) tabular-nums group-hover:hidden">
                {count}
              </span>
            )}
          </button>
        )}

        <div
          className={cn(
            'absolute right-1.5 items-center gap-0.5',
            mode === 'idle'
              ? 'hidden group-focus-within:flex group-hover:flex'
              : 'flex',
          )}
        >
          {mode === 'idle' ? (
            <>
              <button
                type="button"
                aria-label={`Rename folder ${folder.name}`}
                className={iconButton}
                onClick={() => {
                  setDraft(folder.name)
                  setMode('renaming')
                }}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Delete folder ${folder.name}`}
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
                aria-label={
                  mode === 'deleting' ? 'Confirm delete' : 'Save name'
                }
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
      </div>
      {expanded && (
        <ul className="ml-4 list-none space-y-0.5 border-l border-(--ws-sidebar-border) p-0 pl-2">
          {count ? (
            children
          ) : (
            <li className="px-3 py-1.5 text-xs text-(--ws-muted)">
              Drag conversations here
            </li>
          )}
        </ul>
      )}
    </li>
  )
}
