'use client'

import * as React from 'react'
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { ChevronDownIcon, CheckIcon, XIcon } from 'lucide-react'

import { cn } from '@/components/shadcn/lib/utils'

const Combobox = ComboboxPrimitive.Root

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

function ComboboxInputGroup({
  className,
  ...props
}: ComboboxPrimitive.InputGroup.Props) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        'border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border bg-background px-2.5 py-1 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        'placeholder:text-muted-foreground h-7 min-w-12 flex-1 border-0 bg-transparent p-0 text-sm text-inherit outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        'text-muted-foreground flex h-7 w-6 shrink-0 items-center justify-center border-0 bg-transparent p-0 outline-hidden',
        className,
      )}
      {...props}
    >
      {children ?? <ChevronDownIcon className="pointer-events-none size-4" />}
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxClear({
  className,
  children,
  ...props
}: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(
        'text-muted-foreground flex h-7 w-6 shrink-0 items-center justify-center border-0 bg-transparent p-0 outline-hidden',
        className,
      )}
      {...props}
    >
      {children ?? <XIcon className="pointer-events-none size-4" />}
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxChips({
  className,
  ...props
}: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn('flex flex-1 flex-wrap items-center gap-1', className)}
      {...props}
    />
  )
}

function ComboboxChip({ className, ...props }: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'bg-secondary text-secondary-foreground focus-within:bg-primary focus-within:text-primary-foreground data-highlighted:bg-primary data-highlighted:text-primary-foreground flex h-6 min-h-6 cursor-default items-center gap-1 rounded-sm py-0 pr-1 pl-2 text-xs leading-none outline-hidden',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxChipRemove({
  className,
  children,
  ...props
}: ComboboxPrimitive.ChipRemove.Props) {
  return (
    <ComboboxPrimitive.ChipRemove
      data-slot="combobox-chip-remove"
      className={cn(
        'hover:bg-foreground/10 flex size-4 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-inherit outline-hidden',
        className,
      )}
      {...props}
    >
      {children ?? <XIcon className="pointer-events-none size-3" />}
    </ComboboxPrimitive.ChipRemove>
  )
}

function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50 outline-hidden"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            'bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--available-height) w-(--anchor-width) min-w-[8rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md py-1 shadow-md ring-1 duration-100',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        'text-muted-foreground py-2 pr-4 pl-2 text-sm data-[empty]:hidden',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn('outline-hidden', className)}
      {...props}
    />
  )
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        'data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn('scroll-my-1', className)}
      {...props}
    />
  )
}

/** Renders the items of a `<ComboboxGroup items={...}>` — required for grouped lists. */
function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection {...props} />
}

function ComboboxGroupLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...props}
    />
  )
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

function ComboboxStatus({ className, ...props }: ComboboxPrimitive.Status.Props) {
  return (
    <ComboboxPrimitive.Status
      data-slot="combobox-status"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...props}
    />
  )
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxStatus,
  ComboboxTrigger,
  ComboboxValue,
}
