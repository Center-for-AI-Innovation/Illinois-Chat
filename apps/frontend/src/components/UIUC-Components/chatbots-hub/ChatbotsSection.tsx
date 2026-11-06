import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/shadcn/ui/button'
import { LoadingSpinner } from '~/components/UIUC-Components/LoadingSpinner'
import {
  type PagedChatbotsSource,
  usePagedChatbots,
} from '~/hooks/queries/usePagedChatbots'
import { ChatbotHubCard } from './ChatbotHubCard'
import { type ChatbotCardData } from './chatbots.types'
import { useCardGridColumns } from './useCardGridColumns'

type ChatbotsSectionProps = {
  title: string
  /** Shown in place of the grid when the section has no bots; otherwise the section is hidden. */
  empty?: ReactNode
} & (
  | {
      cards: ChatbotCardData[]
      source?: never
    }
  | { source: PagedChatbotsSource; cards?: never }
)

// Section of chatbots, either from a static list or a paged API source.
// The static list is only for Public Bots, till we get it from Admin UI instead of redis.
export function ChatbotsSection({
  title,
  cards,
  source,
  empty,
}: ChatbotsSectionProps) {
  const { ref: gridRef, columns } = useCardGridColumns()
  // Index of the first visible card, so a resize keeps the user's place.
  const [firstIndex, setFirstIndex] = useState(0)
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  // Arrow to focus once paging disables the one that was clicked.
  const pendingFocus = useRef<'prev' | 'next' | null>(null)

  // One row per page: page size follows the column count.
  const perPage = columns
  // Remote sections fetch the page at firstIndex; the clamp below catches stale offsets.
  const remoteStart = Math.floor(firstIndex / perPage) * perPage
  const remote = usePagedChatbots({
    source: source ?? 'yours',
    offset: remoteStart,
    limit: perPage,
    enabled: !!source,
  })
  const total = source ? (remote.data?.total ?? 0) : cards.length
  const isInitialLoad = !!source && !remote.data && !remote.isError

  const totalPages = Math.max(1, Math.ceil(total / perPage))
  // Clamp: the list can shrink (refetch) while `firstIndex` is stale.
  const currentPage = Math.min(Math.floor(firstIndex / perPage) + 1, totalPages)
  const start = (currentPage - 1) * perPage
  const pageCards = source
    ? (remote.data?.results ?? [])
    : cards.slice(start, start + perPage)

  // Re-anchor so the list growing back doesn't jump to the old page.
  if (!isInitialLoad && firstIndex >= total && firstIndex !== start) {
    setFirstIndex(start)
  }

  useEffect(() => {
    if (pendingFocus.current === 'prev') prevRef.current?.focus()
    if (pendingFocus.current === 'next') nextRef.current?.focus()
    pendingFocus.current = null
  }, [currentPage])

  const goToPage = (page: number) => {
    if (page <= 1) pendingFocus.current = 'next'
    else if (page >= totalPages) pendingFocus.current = 'prev'
    setFirstIndex((page - 1) * perPage)
  }

  if (!isInitialLoad && total === 0) {
    return empty ? (
      <section className="px-4 py-10 sm:px-8">
        <h2 className="mb-6 text-2xl font-bold text-(--illinois-blue) dark:text-white">
          {title}
        </h2>
        {empty}
      </section>
    ) : null
  }

  return (
    <section className="px-4 py-10 sm:px-8">
      <h2 className="mb-6 text-2xl font-bold text-(--illinois-blue) dark:text-white">
        {title}
      </h2>
      <div
        ref={gridRef}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        className="grid gap-5 py-6"
      >
        {pageCards.map((card) => (
          <div
            key={`${title}-${card.course_name}`}
            className="min-w-0 [&>*]:h-full"
          >
            <ChatbotHubCard {...card} />
          </div>
        ))}
      </div>
      {isInitialLoad && (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-(--illinois-storm-medium) dark:text-[#94a3b8]">
          <Button
            ref={prevRef}
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            aria-label={`Previous page of ${title}`}
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span aria-live="polite" className="min-w-20 text-center">
            {start + 1}–{start + pageCards.length} of {total}
          </span>
          <Button
            ref={nextRef}
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            aria-label={`Next page of ${title}`}
            disabled={currentPage >= totalPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  )
}
