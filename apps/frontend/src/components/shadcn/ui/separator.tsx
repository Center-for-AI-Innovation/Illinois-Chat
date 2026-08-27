'use client'

import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'

import { cn } from '@/components/shadcn/lib/utils'

function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch shrink-0 bg-border',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
