'use client'
import { useState } from 'react'
import { Check, Download, Laptop, Moon, Sun, Trash2, X } from 'lucide-react'
import { Loader } from '@/components/ai-elements/loader'
import { cn } from '@/components/shadcn/lib/utils'
import { useTheme } from '~/contexts/ThemeContext'

const THEMES = [
  { value: 'system', label: 'System theme', Icon: Laptop },
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
] as const

const rowButton =
  'flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm text-(--ws-text) transition-colors hover:bg-(--ws-sidebar-accent)/60 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-(--ws-accent) focus-visible:outline-none'

export interface SidebarFooterProps {
  canClear: boolean
  isExporting: boolean
  onClear: () => void
  onExport: () => void
}

export function SidebarFooter({
  canClear,
  isExporting,
  onClear,
  onExport,
}: SidebarFooterProps) {
  const { theme, setTheme } = useTheme()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="space-y-0.5 border-t border-(--ws-sidebar-border) p-4 pt-3">
      {canClear &&
        (confirming ? (
          <div className="flex h-8 items-center gap-2.5 px-2 text-sm text-(--ws-error)">
            <Trash2 className="size-3.5 shrink-0" />
            <span className="flex-1">Delete all conversations?</span>
            <button
              type="button"
              aria-label="Confirm clear conversations"
              className="inline-flex size-6 items-center justify-center rounded-md hover:bg-(--ws-hover)"
              onClick={() => {
                setConfirming(false)
                onClear()
              }}
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Cancel"
              className="inline-flex size-6 items-center justify-center rounded-md text-(--ws-muted) hover:bg-(--ws-hover)"
              onClick={() => setConfirming(false)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={rowButton}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-3.5 text-(--ws-muted)" />
            Clear conversations
          </button>
        ))}
      <button
        type="button"
        className={rowButton}
        disabled={isExporting}
        onClick={onExport}
      >
        {isExporting ? (
          <Loader size={14} className="text-(--ws-accent)" />
        ) : (
          <Download className="size-3.5 text-(--ws-muted)" />
        )}
        {isExporting ? 'Preparing export…' : 'Export conversation history'}
      </button>
      <div className="flex items-center justify-between gap-2 pt-2 pl-2">
        <span className="text-xs text-(--ws-muted)">Appearance</span>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="flex items-center gap-0.5 rounded-lg bg-(--ws-fill) p-0.5"
        >
          {THEMES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              aria-label={label}
              title={label}
              onClick={() => setTheme(value)}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-md text-(--ws-muted) transition-colors hover:text-(--ws-heading)',
                theme === value &&
                  'bg-(--ws-raised) text-(--ws-heading) shadow-(--ws-elevation)',
              )}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
