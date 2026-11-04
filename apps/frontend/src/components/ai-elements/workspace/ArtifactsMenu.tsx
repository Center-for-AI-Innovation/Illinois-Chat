'use client'
import { useState } from 'react'
import { ChevronDown, Layers } from 'lucide-react'
import { cn } from '@/components/shadcn/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/shadcn/ui/popover'
import { type WorkspaceArtifact } from '@/types/workspace'
import { workspaceTheme } from './theme'
import { artifactIcons, artifactLabels } from './ToolParts'

export function ArtifactsMenu({
  artifacts,
  className,
  onOpen,
}: {
  artifacts: WorkspaceArtifact[]
  className: string
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const label = (
    <>
      <Layers className="size-3.5" />
      Artifacts
      <span className="text-(--ws-muted) tabular-nums">{artifacts.length}</span>
    </>
  )

  if (artifacts.length === 1)
    return (
      <button
        type="button"
        className={className}
        onClick={() => onOpen(artifacts[0]!.id)}
      >
        {label}
      </button>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={className} aria-label="Open an artifact">
        {label}
        <ChevronDown className="size-3.5 text-(--ws-muted)" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn(
          workspaceTheme,
          'w-[min(20rem,calc(100vw-2rem))] gap-0 rounded-xl border border-(--ws-line) bg-(--ws-surface) p-0 text-(--ws-text) shadow-lg ring-0',
        )}
      >
        <p className="border-b border-(--ws-line) px-4 pt-3.5 pb-3 text-sm font-semibold text-(--ws-heading)">
          Artifacts in this conversation
        </p>
        <ul className="max-h-80 list-none space-y-0.5 overflow-y-auto p-2">
          {artifacts.toReversed().map((artifact) => {
            const Icon = artifactIcons[artifact.kind]
            return (
              <li key={artifact.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpen(artifact.id)
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-(--ws-sidebar-accent) focus-visible:bg-(--ws-sidebar-accent)"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-(--ws-sidebar-accent) text-(--ws-sidebar-accent-text)">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-(--ws-heading)">
                      {artifact.title}
                    </span>
                    <span className="block text-xs text-(--ws-muted)">
                      {artifact.streaming
                        ? 'Writing…'
                        : artifactLabels[artifact.kind]}
                      {artifact.language && artifact.kind === 'code'
                        ? ` · ${artifact.language}`
                        : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
