import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { IconCircleChevronRight } from '@tabler/icons-react'
import { cva } from 'class-variance-authority'

import { cn } from '@/components/shadcn/lib/utils'

// `figma` is the full-size card from the Project Data redesign (frames
// 2574:10784 / 2666:7226). `compact` is what the legacy dashboard and the
// new-project wizard get, so their grids keep roughly their old tile height.
// Only IntegrationsSection opts in to `figma`.
export type IntegrationCardSize = 'figma' | 'compact'
export const IntegrationCardSizeContext =
  createContext<IntegrationCardSize>('compact')

const cardVariants = cva(
  'group border-border bg-card text-card-foreground focus-visible:ring-ring flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[14px] border text-left shadow-sm transition-all duration-300 outline-none hover:scale-[1.02] hover:shadow-lg focus-visible:ring-2 dark:border-white/15 dark:bg-white/5',
)
const bodyVariants = cva(
  'flex w-full flex-1 flex-col items-center text-center',
  {
    variants: {
      size: { figma: 'gap-4 p-6', compact: 'gap-2 p-4' },
    },
  },
)
const logoVariants = cva('flex shrink-0 items-center justify-center', {
  variants: { size: { figma: 'size-20', compact: 'size-10' } },
})
const footerVariants = cva(
  'border-border flex w-full items-center justify-center border-t dark:border-white/15',
  {
    variants: {
      size: { figma: 'px-6 py-4', compact: 'px-4 py-2' },
    },
  },
)

type IntegrationCardProps = {
  // Rendered at the card's logo size: pass something that fills its box.
  logo: ReactNode
  title: string
  description: string
} & Omit<ComponentPropsWithoutRef<'button'>, 'title'>

// Muted rounded tile for icon-only logos (Website, GitHub). The lighter dark
// fill keeps it visible on the dark card surface.
export function IntegrationLogoTile({ children }: { children: ReactNode }) {
  return (
    <span className="bg-muted flex size-full items-center justify-center rounded-[14px] dark:bg-white/10">
      {children}
    </span>
  )
}

// Trigger card for an ingest dialog: centered logo, title and description,
// with a "Configure Import" footer under a divider. A native button so it can
// be handed to DialogTrigger's `render` and gets keyboard/focus handling for
// free.
export const IntegrationCard = forwardRef<
  HTMLButtonElement,
  IntegrationCardProps
>(function IntegrationCard(
  { logo, title, description, className, type = 'button', ...props },
  ref,
) {
  const titleId = useId()
  const size = useContext(IntegrationCardSizeContext)
  return (
    <button
      ref={ref}
      type={type}
      aria-labelledby={titleId}
      className={cn(cardVariants(), className)}
      {...props}
    >
      <span className={bodyVariants({ size })}>
        <span className={logoVariants({ size })}>{logo}</span>
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
      <span className={footerVariants({ size })}>
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
