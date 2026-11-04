import { workspace_body, workspace_display } from 'fonts'
import { cn } from '@/components/shadcn/lib/utils'

export const workspaceTheme = cn(
  'ic-workspace font-wsBody',
  workspace_display.variable,
  workspace_body.variable,
)

const pressable =
  'inline-flex items-center justify-center gap-2 rounded-lg transition-[background-color,color,box-shadow] outline-offset-2 disabled:pointer-events-none disabled:opacity-50'

/** Tonal, borderless button for the white chat canvas. */
export const fillButton = cn(
  pressable,
  'bg-(--ws-fill) text-(--ws-heading) shadow-(--ws-elevation) hover:bg-(--ws-fill-hover) hover:text-(--ws-sidebar-accent-text) data-popup-open:bg-(--ws-fill-hover)',
)

/** Raised, borderless button for tinted surfaces like the sidebar. */
export const raisedButton = cn(
  pressable,
  'bg-(--ws-raised) text-(--ws-heading) shadow-(--ws-elevation) hover:bg-(--ws-fill-hover) hover:text-(--ws-sidebar-accent-text)',
)

/** Quiet icon button that only shows a fill on hover. */
export const ghostButton = cn(
  pressable,
  'text-(--ws-muted) hover:bg-(--ws-fill-hover) hover:text-(--ws-sidebar-accent-text) data-popup-open:bg-(--ws-fill-hover)',
)

/** Composer pickers, matching the Figma composer (model, documents, tools). */
export const pickerButton = cn(
  pressable,
  'h-8 border border-(--ws-input) bg-(--ws-surface) px-3 text-xs font-medium text-(--ws-heading) shadow-xs hover:bg-(--ws-fill) data-popup-open:bg-(--ws-fill) [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-(--ws-muted)',
)
