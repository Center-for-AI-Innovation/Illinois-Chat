import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { IconArrowRight } from '@tabler/icons-react'

import { cn } from '@/components/shadcn/lib/utils'

type IntegrationCardProps = {
  logo: ReactNode
  title: string
  description: string
} & Omit<ComponentPropsWithoutRef<'button'>, 'title'>

// Trigger card for an ingest dialog. A native button so it can be handed to
// DialogTrigger's `render` and gets keyboard/focus handling for free.
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
        'group focus-visible:ring-ring flex h-full w-full cursor-pointer flex-col items-start gap-3 rounded-2xl border border-(--dashboard-border) bg-transparent p-5 text-left text-(--dashboard-foreground) transition-shadow outline-none hover:shadow-md focus-visible:ring-2',
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center">
          {logo}
        </span>
        <span id={titleId} className="text-lg leading-6 font-semibold">
          {title}
        </span>
      </span>
      <span className="text-sm leading-relaxed text-(--dashboard-foreground-faded)">
        {description}
      </span>
      <span className="mt-auto flex items-center text-sm font-semibold text-(--dashboard-button)">
        Configure Import
        <IconArrowRight
          size={16}
          aria-hidden="true"
          className="ml-2 transition-transform group-hover:translate-x-1"
        />
      </span>
    </button>
  )
})
