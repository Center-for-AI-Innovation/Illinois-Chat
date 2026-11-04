'use client'
import { type ReactNode } from 'react'
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react'
import { cn } from '@/components/shadcn/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/shadcn/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import { type Action, type UIUCTool } from '@/types/chat'
import { pickerButton, workspaceTheme } from './theme'

export type Effort = 'low' | 'medium' | 'high'

const EFFORTS: { value: Effort; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function WsSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-(--ws-accent) focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-(--ws-blue) dark:bg-(--ws-orange)' : 'bg-(--ws-line)',
      )}
    >
      <span
        className={cn(
          'size-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-4.5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

function MenuTrigger({
  icon,
  label,
  active,
  disabled,
  ariaLabel,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <PopoverTrigger
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        pickerButton,
        'min-w-0 shrink-0 px-2.5 @2xl/composer:shrink @2xl/composer:px-3',
        !active && 'text-(--ws-muted)',
      )}
    >
      {icon}
      <span className="hidden max-w-32 min-w-0 truncate @2xl/composer:inline">
        {label}
      </span>
      <ChevronDown className="hidden @2xl/composer:block" />
    </PopoverTrigger>
  )
}

function MenuPanel({
  title,
  action,
  className,
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={8}
      className={cn(
        workspaceTheme,
        'gap-0 rounded-xl border-0 bg-(--ws-surface) p-1 text-(--ws-text) shadow-[0_12px_32px_-8px_rgb(19_41_75/0.22),0_0_0_1px_rgb(19_41_75/0.06)] ring-0',
        className,
      )}
    >
      <div className="flex min-h-8 items-center justify-between gap-3 px-2.5">
        <p className="text-xs font-semibold text-(--ws-muted)">{title}</p>
        {action}
      </div>
      <div aria-hidden className="-mx-1 my-1 h-px bg-(--ws-sidebar-border)" />
      {children}
    </PopoverContent>
  )
}

function MenuOption({
  role,
  label,
  hint,
  checked,
  disabled,
  onSelect,
}: {
  role: 'radio' | 'checkbox'
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-8 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm outline-offset-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'font-medium text-(--ws-sidebar-accent-text)'
          : 'text-(--ws-text) enabled:hover:bg-(--ws-fill)',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {hint && (
          <Tooltip>
            <TooltipTrigger
              delay={250}
              render={
                <span className="line-clamp-1 text-xs font-normal text-(--ws-muted)" />
              }
            >
              {hint}
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={12}
              className="max-w-xs text-xs leading-relaxed"
            >
              {hint}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
      <Check
        aria-hidden
        className={cn(
          'size-4 shrink-0 text-(--ws-accent) transition-opacity',
          checked ? 'opacity-100' : 'opacity-0',
        )}
      />
    </button>
  )
}

export interface DocumentsMenuProps {
  enabled: boolean
  locked: boolean
  groups: Action[]
  onEnabledChange: (enabled: boolean) => void
  onToggleGroup: (id: string) => void
}

export function DocumentsMenu({
  enabled,
  locked,
  groups,
  onEnabledChange,
  onToggleGroup,
}: DocumentsMenuProps) {
  const selected = groups.filter((g) => g.checked && !g.adminDisabled)
  const label = !enabled
    ? 'Documents off'
    : !selected.length || selected.some((g) => g.id === 'DocGroup-all')
      ? 'All documents'
      : selected.length === 1
        ? selected[0]!.name
        : `${selected.length} groups`
  const ordered = [
    ...groups.filter((g) => g.id === 'DocGroup-all'),
    ...groups.filter((g) => g.id !== 'DocGroup-all'),
  ]

  return (
    <Popover>
      <MenuTrigger
        icon={<BookOpen />}
        label={label}
        active={enabled}
        ariaLabel={`Project documents: ${label}`}
      />
      <MenuPanel
        title="Document groups"
        className="w-[min(16rem,calc(100vw-2rem))]"
        action={
          <WsSwitch
            checked={enabled}
            disabled={locked}
            label="Search project documents"
            onChange={onEnabledChange}
          />
        }
      >
        <div
          role="group"
          aria-label="Document groups"
          className="max-h-72 overflow-y-auto"
        >
          {ordered.map((group) => (
            <MenuOption
              key={group.id}
              role="checkbox"
              label={group.id === 'DocGroup-all' ? 'All documents' : group.name}
              hint={
                group.adminDisabled ? 'Disabled by a project admin' : undefined
              }
              checked={Boolean(group.checked && !group.adminDisabled)}
              disabled={!enabled || group.adminDisabled}
              onSelect={() => onToggleGroup(group.id)}
            />
          ))}
        </div>
      </MenuPanel>
    </Popover>
  )
}

export interface ToolsMenuProps {
  tools: UIUCTool[]
  onToggle: (id: string, enabled: boolean) => void
}

export function ToolsMenu({ tools, onToggle }: ToolsMenuProps) {
  const enabled = tools.filter((t) => t.enabled !== false).length
  return (
    <Popover>
      <MenuTrigger
        icon={<Wrench />}
        label={`Tools ${enabled}/${tools.length}`}
        active={enabled > 0}
        ariaLabel={`Tools: ${enabled} of ${tools.length} enabled`}
      />
      <MenuPanel title="Tools" className="w-[min(18rem,calc(100vw-2rem))]">
        <div
          role="group"
          aria-label="Tools"
          className="max-h-72 overflow-y-auto"
        >
          {tools.map((tool) => {
            const on = tool.enabled !== false
            return (
              <MenuOption
                key={tool.id}
                role="checkbox"
                label={tool.readableName || tool.name}
                hint={tool.description}
                checked={on}
                onSelect={() => onToggle(tool.id, !on)}
              />
            )
          })}
        </div>
      </MenuPanel>
    </Popover>
  )
}

export interface ModelSettingsMenuProps {
  reasoning: boolean
  effort: Effort
  temperature: number
  disabled?: boolean
  onEffortChange: (effort: Effort) => void
  onTemperatureChange: (temperature: number) => void
}

export function ModelSettingsMenu({
  reasoning,
  effort,
  temperature,
  disabled,
  onEffortChange,
  onTemperatureChange,
}: ModelSettingsMenuProps) {
  const effortLabel = EFFORTS.find((e) => e.value === effort)?.label
  return (
    <Popover>
      <MenuTrigger
        icon={reasoning ? <Brain /> : <SlidersHorizontal />}
        label={
          reasoning
            ? (effortLabel ?? 'Reasoning')
            : `Temp ${temperature.toFixed(1)}`
        }
        disabled={disabled}
        ariaLabel={
          reasoning
            ? `Reasoning effort: ${effortLabel}`
            : `Temperature: ${temperature.toFixed(1)}`
        }
      />
      {reasoning ? (
        <MenuPanel title="Reasoning" className="w-40">
          <div role="radiogroup" aria-label="Reasoning effort">
            {EFFORTS.map((option) => (
              <MenuOption
                key={option.value}
                role="radio"
                label={option.label}
                checked={effort === option.value}
                onSelect={() => onEffortChange(option.value)}
              />
            ))}
          </div>
        </MenuPanel>
      ) : (
        <MenuPanel
          title="Temperature"
          className="w-[min(16rem,calc(100vw-2rem))]"
          action={
            <span className="text-xs font-semibold text-(--ws-heading) tabular-nums">
              {temperature.toFixed(1)}
            </span>
          }
        >
          <label className="block px-2.5 pt-1 pb-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              aria-label="Temperature"
              onChange={(event) =>
                onTemperatureChange(Number(event.target.value))
              }
              className="w-full cursor-pointer accent-(--ws-orange)"
            />
            <span className="mt-1 flex justify-between text-xs text-(--ws-muted)">
              <span>Focused</span>
              <span>Creative</span>
            </span>
          </label>
        </MenuPanel>
      )}
    </Popover>
  )
}
