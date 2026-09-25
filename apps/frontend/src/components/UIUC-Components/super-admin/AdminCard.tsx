// Card chrome and the three states every card in this folder needs
// (loading, error-with-retry, empty). Kept in one place so the surfaces,
// radii, and dark-mode pairs cannot drift card to card.

import { cva } from 'class-variance-authority'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import type { ReactNode } from 'react'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '~/components/shadcn/ui/alert'
import { Button } from '~/components/shadcn/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/shadcn/ui/card'
import { Skeleton } from '~/components/shadcn/ui/skeleton'

export const adminCardVariants = cva(
  'gap-5 rounded-[14px] bg-white py-5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] ring-1 sm:py-6 dark:bg-[#13294b] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)]',
  {
    variants: {
      tone: {
        default: 'ring-[#e5e7eb] dark:ring-[#32517a]',
        // For a card whose current state is doing something visible to every
        // visitor — maintenance mode while it is on.
        alert: 'ring-2 ring-(--illinois-orange)',
      },
    },
    defaultVariants: { tone: 'default' },
  },
)

export const adminMutedTextClass =
  'text-(--illinois-storm-dark) dark:text-[#c8d2e3]'
export const adminSubtleTextClass =
  'text-(--illinois-storm-medium) dark:text-[#94a3b8]'
export const adminInsetClass =
  'rounded-[8px] bg-(--background-faded) dark:bg-[#0c1f3f]'
// The shadcn muted/background tokens are not dark-adapted in this app, so the
// admin tab bars pin their dark surfaces to the same palette as the cards.
export const adminTabsListClass = 'dark:bg-[#0c1f3f] dark:ring-1 dark:ring-[#32517a]'
export const adminTabsTriggerClass =
  'cursor-pointer disabled:cursor-not-allowed dark:text-[#94a3b8] dark:hover:text-white dark:data-active:border-[#32517a] dark:data-active:bg-[#13294b] dark:data-active:text-white'
// Same token problem for shadcn field helper text on the navy card surface.
export const adminFieldDescriptionClass =
  'dark:[&_[data-slot=field-description]]:text-[#94a3b8]'

interface AdminCardProps {
  title: string
  /**
   * One line naming the blast radius. Every card leads with this: an operator
   * has to know that flipping maintenance affects every visitor before they
   * flip it, not after.
   */
  blastRadius: string
  icon?: ReactNode
  tone?: 'default' | 'alert'
  headerAside?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

export function AdminCard({
  title,
  blastRadius,
  icon,
  tone = 'default',
  headerAside,
  footer,
  children,
}: AdminCardProps) {
  return (
    <Card className={adminCardVariants({ tone })}>
      <CardHeader className="gap-1.5 px-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="hidden size-9 shrink-0 items-center sm:flex justify-center rounded-[10px] bg-(--illinois-orange)/10 text-(--illinois-orange)">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <CardTitle
              role="heading"
              aria-level={2}
              className={`text-lg font-semibold text-(--illinois-blue) dark:text-white ${montserrat_heading.variable} font-montserratHeading`}
            >
              {title}
            </CardTitle>
            <CardDescription
              className={`mt-0.5 leading-5 ${adminMutedTextClass} ${montserrat_paragraph.variable} font-montserratParagraph`}
            >
              {blastRadius}
            </CardDescription>
          </div>
        </div>
        {headerAside && <CardAction>{headerAside}</CardAction>}
      </CardHeader>

      <CardContent className={`px-5 sm:px-6 ${adminFieldDescriptionClass}`}>
        {children}
      </CardContent>

      {footer && (
        <CardFooter className="flex-wrap justify-end gap-3 border-t border-[#e5e7eb] px-5 pt-4 sm:px-6 dark:border-[#32517a]">
          {footer}
        </CardFooter>
      )}
    </Card>
  )
}

/**
 * Placeholder that matches the real card's geometry.
 *
 * `ProjectTable` returns a bare `null` while loading, which makes the page
 * jump once data lands; this exists so the admin console does not.
 */
export function AdminCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className={adminCardVariants()} aria-busy="true">
      <CardContent className="flex flex-col gap-5 px-5 sm:px-6">
        <div className="flex items-start gap-3">
          <Skeleton className="size-9 rounded-[10px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full rounded-[8px]" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Inline, persistent error with a retry.
 *
 * Deliberately not a toast: a load failure is the state of the panel, and a
 * notification that fades leaves an operator staring at an empty form with no
 * idea whether it is empty or broken.
 */
export function AdminInlineError({
  title = 'Something went wrong',
  message,
  onRetry,
  isRetrying = false,
}: {
  title?: string
  message: string
  onRetry?: () => void
  isRetrying?: boolean
}) {
  return (
    <Alert
      variant="destructive"
      className="border-red-300 bg-red-50 text-red-800 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200"
    >
      <AlertTriangle aria-hidden="true" />
      <AlertTitle className="font-semibold">{title}</AlertTitle>
      <AlertDescription className="wrap-break-word text-red-700 dark:text-red-300">
        {message}
      </AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-500/50 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-500/20"
          >
            <RefreshCw
              className={isRetrying ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
            {isRetrying ? 'Retrying' : 'Retry'}
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}

/** Non-blocking warning — the panel still works, but something is degraded. */
export function AdminInlineWarning({ message }: { message: string }) {
  return (
    <Alert
      role="status"
      className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <AlertTriangle aria-hidden="true" />
      <AlertDescription className="wrap-break-word text-current">
        {message}
      </AlertDescription>
    </Alert>
  )
}
