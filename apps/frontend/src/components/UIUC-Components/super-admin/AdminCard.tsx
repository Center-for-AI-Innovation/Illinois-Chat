// Card chrome and the three states every card in this folder needs
// (loading, error-with-retry, empty). Kept in one place so the surfaces,
// radii, and dark-mode pairs cannot drift card to card.

import { cva } from 'class-variance-authority'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import type { ReactNode } from 'react'
import { Button } from '~/components/shadcn/ui/button'
import { Card, CardContent } from '~/components/shadcn/ui/card'
import { Skeleton } from '~/components/shadcn/ui/skeleton'

export const adminCardVariants = cva(
  'rounded-[14px] border bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:bg-[#13294b] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)]',
  {
    variants: {
      tone: {
        default: 'border-[#e5e7eb] dark:border-[#32517a]',
        // For a card whose current state is doing something visible to every
        // visitor — maintenance mode while it is on.
        alert: 'border-[--illinois-orange] dark:border-[--illinois-orange]',
      },
    },
    defaultVariants: { tone: 'default' },
  },
)

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
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 shrink-0 text-[--illinois-orange]">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2
                className={`truncate text-lg font-semibold text-[--illinois-blue] dark:text-white ${montserrat_heading.variable} font-montserratHeading`}
              >
                {title}
              </h2>
              <p
                className={`mt-1 text-sm leading-5 text-[--illinois-storm-dark] dark:text-[#c8d2e3] ${montserrat_paragraph.variable} font-montserratParagraph`}
              >
                {blastRadius}
              </p>
            </div>
          </div>
          {headerAside && <div className="shrink-0">{headerAside}</div>}
        </div>

        {children}

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#e5e7eb] pt-4 dark:border-[#32517a]">
            {footer}
          </div>
        )}
      </CardContent>
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
    <Card className={adminCardVariants()}>
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full rounded-[8px]" />
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
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-[8px] border border-red-300 bg-red-50 p-4 text-sm dark:border-red-500/50 dark:bg-red-500/10 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 gap-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-semibold text-red-800 dark:text-red-200">
            {title}
          </p>
          <p className="mt-1 break-words text-red-700 dark:text-red-300">
            {message}
          </p>
        </div>
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="shrink-0 gap-2 border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-500/50 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-500/20"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {isRetrying ? 'Retrying' : 'Retry'}
        </Button>
      )}
    </div>
  )
}

/** Non-blocking warning — the panel still works, but something is degraded. */
export function AdminInlineWarning({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-[8px] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 break-words">{message}</p>
    </div>
  )
}
