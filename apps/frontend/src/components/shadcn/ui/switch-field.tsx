'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/components/shadcn/lib/utils'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '@/components/shadcn/ui/field'
import { Switch, type SwitchProps } from '@/components/shadcn/ui/switch'

// Switch + title/description, matching the Figma "Switch" component's
// Side (left | right) and Type (default | box) variants.
const switchFieldVariants = cva('gap-3', {
  variants: {
    type: {
      default: '',
      box: 'bg-background rounded-lg border p-4 shadow-xs',
    },
    side: {
      left: '',
      right: 'flex-row-reverse',
    },
  },
  defaultVariants: {
    type: 'default',
    side: 'left',
  },
})

type SwitchFieldProps = Omit<
  SwitchProps,
  'label' | 'tooltip' | 'className' | 'children'
> &
  VariantProps<typeof switchFieldVariants> & {
    label: React.ReactNode
    description?: React.ReactNode
    className?: string
  }

function SwitchField({
  label,
  description,
  type,
  side,
  className,
  id,
  disabled,
  ...switchProps
}: SwitchFieldProps) {
  const generatedId = React.useId()
  const switchId = id ?? generatedId
  const descriptionId = description ? `${switchId}-description` : undefined

  return (
    <Field
      orientation="horizontal"
      data-slot="switch-field"
      data-disabled={disabled}
      className={cn(switchFieldVariants({ type, side }), className)}
    >
      <Switch
        id={switchId}
        disabled={disabled}
        aria-describedby={descriptionId}
        {...switchProps}
      />
      <FieldContent className="gap-2">
        <FieldLabel
          htmlFor={switchId}
          className={cn('leading-none', type !== 'box' && 'pt-[3px]')}
        >
          {label}
        </FieldLabel>
        {description && (
          <FieldDescription id={descriptionId} className="leading-5">
            {description}
          </FieldDescription>
        )}
      </FieldContent>
    </Field>
  )
}

export { SwitchField, switchFieldVariants }
export type { SwitchFieldProps }
