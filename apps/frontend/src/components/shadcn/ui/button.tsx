import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/components/shadcn/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow] outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-xs hover:border-(--accent-border) hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        danger:
          'bg-red-600 text-white font-semibold hover:bg-red-700 disabled:bg-red-600/50 disabled:text-white/50',
        dashboard:
          'bg-(--dashboard-button) font-semibold text-sm text-(--dashboard-button-foreground) hover:bg-(--dashboard-button-hover) disabled:bg-(--background-faded) disabled:text-(--foreground-faded)',
      },
      size: {
        default: 'h-9 px-4 py-2',
        xs: 'h-6 px-2 text-xs',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-8',
        icon: 'size-9',
        // Figma "icon sm"
        'icon-xs': 'size-5 rounded-sm',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
