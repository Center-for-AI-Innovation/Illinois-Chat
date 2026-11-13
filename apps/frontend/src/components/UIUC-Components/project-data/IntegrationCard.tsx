import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { IconCircleChevronRight } from '@tabler/icons-react'

import { cn } from '@/components/shadcn/lib/utils'

type IntegrationCardProps = {
  logo: ReactNode
  title: string
  description: string
} & Omit<ComponentPropsWithoutRef<'button'>, 'title'>

// Trigger card for an ingest dialog: centered 80px logo, title and
// description, with a "Configure Import" footer under a divider. A native
// button so it can be handed to DialogTrigger's `render` and gets
// keyboard/focus handling for free.
export const IntegrationCard = forwardRef<
  HTMLButtonElement,
  IntegrationCardProps
>(function IntegrationCard(
  { logo, title, description, className, type = 'button', ...props },
  ref,
) {
  const titleId = useId()
  return (
    <button
      ref={ref}
      type={type}
      aria-labelledby={titleId}
      className={cn(
        'group border-border bg-card text-card-foreground focus-visible:ring-ring flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[14px] border text-left shadow-sm transition-all duration-300 outline-none hover:scale-[1.02] hover:shadow-lg focus-visible:ring-2',
        className,
      )}
      {...props}
    >
      <span className="flex w-full flex-1 flex-col items-center gap-4 p-6 text-center">
        <span className="flex size-20 shrink-0 items-center justify-center">
          {logo}
        </span>
        <span className="flex w-full flex-col gap-1.5">
          <span
            id={titleId}
            className="truncate text-base leading-6 font-semibold"
          >
            {title}
          </span>
          <span className="text-muted-foreground text-sm leading-5">
            {description}
          </span>
        </span>
      </span>
      <span className="border-border flex w-full items-center justify-center border-t px-6 py-4">
        <span className="flex h-8 flex-1 items-center justify-center gap-2 px-3 text-xs leading-4 font-medium">
          Configure Import
          <IconCircleChevronRight
            size={16}
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </span>
    </button>
  )
})
