'use client'
import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
} from '@/components/ai-elements/model-selector'
import { cn } from '@/components/shadcn/lib/utils'
import { pickerButton, workspaceTheme } from './theme'

export function ModelPicker({
  value,
  models,
  disabled,
  onChange,
}: {
  value: string
  models: { id: string; name: string; provider: string }[]
  disabled?: boolean
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger
        disabled={disabled}
        aria-label="Select model"
        className={cn(pickerButton, 'max-w-44 min-w-0')}
      >
        <span className="truncate">
          {models.find((m) => m.id === value)?.name || 'Choose a model'}
        </span>
        <ChevronDown />
      </ModelSelectorTrigger>
      <ModelSelectorContent
        title="Choose your thinking partner"
        className={cn(
          workspaceTheme,
          'gap-0 overflow-hidden rounded-2xl border border-(--ws-line) bg-(--ws-surface) text-(--ws-text) sm:max-w-md',
          '[&_[data-slot=command]]:bg-transparent [&_[data-slot=command]]:p-0',
          '[&_[data-slot=command-input-wrapper]]:border-b [&_[data-slot=command-input-wrapper]]:border-(--ws-line) [&_[data-slot=command-input-wrapper]]:p-3 [&_[data-slot=command-input-wrapper]]:pr-13',
          '[&_[data-slot=dialog-close]]:top-3.5 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:rounded-lg [&_[data-slot=dialog-close]]:text-(--ws-muted) [&_[data-slot=dialog-close]:hover]:bg-(--ws-fill-hover) [&_[data-slot=dialog-close]:hover]:text-(--ws-sidebar-accent-text)',
          '[&_[data-slot=command-input-wrapper]_[data-slot=input-group]]:h-9! [&_[data-slot=command-input-wrapper]_[data-slot=input-group]]:border-(--ws-input) [&_[data-slot=command-input-wrapper]_[data-slot=input-group]]:bg-(--ws-surface) [&_[data-slot=command-input-wrapper]_[data-slot=input-group]]:shadow-xs! [&_[data-slot=command-input-wrapper]_[data-slot=input-group]]:transition-[border-color,box-shadow] [&_[data-slot=command-input]]:pl-1.5',
          '[&_[data-slot=command-list]]:max-h-[min(26rem,60vh)] [&_[data-slot=command-list]]:p-2',
          '[&_[cmdk-group-heading]]:text-(--ws-muted) [&_[data-slot=command-group]]:px-0 [&_[data-slot=command-group]]:pb-2',
          '[&_[data-slot=command-item]]:min-h-9 [&_[data-slot=command-item]]:rounded-lg [&_[data-slot=command-item]]:px-2.5 [&_[data-slot=command-item]]:text-sm [&_[data-slot=command-item][data-selected=false]]:bg-transparent [&_[data-slot=command-item][data-selected=false]]:text-(--ws-text) [&_[data-slot=command-item][data-selected=true]]:bg-(--ws-sidebar-accent) [&_[data-slot=command-item][data-selected=true]]:text-(--ws-sidebar-accent-text)',
        )}
      >
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList>
          <ModelSelectorEmpty>No matching models.</ModelSelectorEmpty>
          {[...new Set(models.map((m) => m.provider))].map((provider) => (
            <ModelSelectorGroup key={provider} heading={provider}>
              {models
                .filter((m) => m.provider === provider)
                .map((model) => (
                  <ModelSelectorItem
                    key={model.id}
                    value={`${model.provider} ${model.name} ${model.id}`}
                    onSelect={() => {
                      onChange(model.id)
                      setOpen(false)
                    }}
                  >
                    <span className="flex-1">{model.name}</span>
                    {model.id === value && (
                      <Check className="size-4 text-(--ws-accent)" />
                    )}
                  </ModelSelectorItem>
                ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  )
}
