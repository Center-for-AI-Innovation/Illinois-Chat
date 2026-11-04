'use client'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { FolderPlus, PanelLeftClose, Search, SquarePen, X } from 'lucide-react'
import { Loader } from '@/components/ai-elements/loader'
import { cn } from '@/components/shadcn/lib/utils'
import { type Conversation } from '@/types/chat'
import { ghostButton, raisedButton } from '../theme'
import { useWorkspaceShell } from '../WorkspaceShell'
import { ConversationItem } from './ConversationItem'
import { groupByDate } from './dateGroups'
import { FolderItem, readDraggedConversationId } from './FolderItem'
import { ProjectCard, type ProjectCardProps } from './ProjectCard'
import { SidebarFooter } from './SidebarFooter'
import { type useConversationSidebar } from './useConversationSidebar'

export interface ConversationSidebarProps {
  project: ProjectCardProps
  model: ReturnType<typeof useConversationSidebar>
  onSelect: (conversation: Conversation) => void
  onNew: () => void
}

const toolButton = cn(ghostButton, 'size-9 shrink-0')

function focusSibling(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[data-conversation]',
    ),
  )
  if (!buttons.length) return
  event.preventDefault()
  const current = buttons.findIndex((b) => b === document.activeElement)
  const next =
    event.key === 'ArrowDown'
      ? current < 0
        ? 0
        : Math.min(current + 1, buttons.length - 1)
      : current < 0
        ? buttons.length - 1
        : Math.max(current - 1, 0)
  buttons[next]?.focus()
}

export function ConversationSidebar({
  project,
  model,
  onSelect,
  onNew,
}: ConversationSidebarProps) {
  const shell = useWorkspaceShell()
  const sentinel = useRef<HTMLDivElement>(null)
  const [dropping, setDropping] = useState(false)
  const { loadMore } = model

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { rootMargin: '0px 0px 160px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore])

  const select = (conversation: Conversation) => {
    shell?.dismissOnMobile()
    onSelect(conversation)
  }

  const renderConversation = (conversation: Conversation) => (
    <ConversationItem
      key={conversation.id}
      conversation={conversation}
      selected={conversation.id === model.selectedId}
      onSelect={select}
      onRename={model.rename}
      onDelete={model.remove}
    />
  )

  const empty =
    !model.loading && !model.conversations.length && !model.folders.length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-4 p-4">
        <ProjectCard {...project} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              shell?.dismissOnMobile()
              onNew()
            }}
            className={cn(
              raisedButton,
              'group/new-chat relative h-9 min-w-0 flex-1 border border-(--ws-input) px-3 text-sm font-medium shadow-xs',
            )}
          >
            <SquarePen className="size-4 shrink-0" />
            New chat
            <kbd className="font-wsBody absolute right-3 hidden text-xs font-normal text-(--ws-muted) opacity-0 transition-opacity group-hover/new-chat:opacity-100 group-focus-visible/new-chat:opacity-100 sm:inline">
              ⌘ K
            </kbd>
          </button>
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            className={toolButton}
            onClick={model.createFolder}
          >
            <FolderPlus className="size-4" />
          </button>
          {shell && (
            <button
              type="button"
              aria-label="Hide conversations"
              title="Hide conversations"
              className={toolButton}
              onClick={shell.hideSidebar}
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
        <label
          data-ws-field
          className="flex h-9 items-center gap-2 rounded-lg border border-transparent bg-(--ws-raised) px-3 text-(--ws-muted) shadow-(--ws-elevation) transition-[border-color,box-shadow]"
        >
          <Search className="size-4 shrink-0" />
          <input
            type="search"
            placeholder="Search conversations"
            aria-label="Search conversations"
            value={model.searchTerm}
            onChange={(event) => model.setSearchTerm(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-(--ws-text) outline-none placeholder:text-(--ws-muted) [&::-webkit-search-cancel-button]:hidden"
          />
          {model.searchTerm && (
            <button
              type="button"
              aria-label="Clear search"
              className="text-(--ws-muted) hover:text-(--ws-heading)"
              onClick={() => model.setSearchTerm('')}
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
      </div>

      <nav
        aria-label="Conversation history"
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
        onKeyDown={focusSibling}
      >
        {model.folders.length > 0 && (
          <section aria-label="Folders" className="mb-3">
            <h2 className="px-2 pb-1.5 text-xs font-medium text-(--ws-muted)">
              Folders
            </h2>
            <ul className="list-none space-y-0.5 p-0">
              {model.folders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  forceOpen={model.searching}
                  onRename={model.renameFolder}
                  onDelete={model.deleteFolder}
                  onDropConversation={model.moveToFolder}
                >
                  {folder.conversations?.map(renderConversation)}
                </FolderItem>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-label="Conversations"
          onDragOver={(event) => {
            event.preventDefault()
            setDropping(true)
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDropping(false)
            const id = readDraggedConversationId(event)
            if (id) model.moveToFolder(id, null)
          }}
          className={cn(
            'rounded-lg transition-colors',
            dropping && 'bg-(--ws-sidebar-accent)/60',
          )}
        >
          {groupByDate(model.conversations).map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <h2 className="px-2 pb-1.5 text-xs font-medium text-(--ws-muted)">
                {group.label}
              </h2>
              <ul
                aria-label={`${group.label} conversations`}
                className="list-none space-y-0.5 p-0"
              >
                {group.items.map(renderConversation)}
              </ul>
            </div>
          ))}
          {model.loading && (
            <div
              role="status"
              className="flex items-center gap-2 px-3 py-2 text-sm text-(--ws-muted)"
            >
              <Loader size={14} className="text-(--ws-accent)" />
              Loading conversations…
            </div>
          )}
          {empty && (
            <p className="px-3 py-2 text-sm text-(--ws-muted)">
              {model.searching
                ? `No conversations match “${model.searchTerm}”.`
                : 'Your conversations will appear here.'}
            </p>
          )}
          <div ref={sentinel} aria-hidden className="h-px" />
          {model.isFetchingNextPage && (
            <div role="status" className="flex justify-center py-2">
              <Loader size={14} className="text-(--ws-accent)" />
              <span className="sr-only">Loading more conversations</span>
            </div>
          )}
        </section>
      </nav>

      <SidebarFooter
        canClear={model.totalConversations > 0}
        isExporting={model.isExporting}
        onClear={model.clearAll}
        onExport={() => void model.exportHistory()}
      />
    </div>
  )
}
