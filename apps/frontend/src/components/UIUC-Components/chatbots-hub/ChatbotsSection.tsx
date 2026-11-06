import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/shadcn/ui/button'
import { ChatbotHubCard } from './ChatbotHubCard'
import { type ChatbotSectionData } from './chatbots.types'
import { useCardGridColumns } from './useCardGridColumns'

export function ChatbotsSection({ title, cards }: ChatbotSectionData) {
  const { ref: gridRef, columns } = useCardGridColumns()
  // Index of the first visible card, so a resize keeps the user's place.
  const [firstIndex, setFirstIndex] = useState(0)
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  // Arrow to focus once paging disables the one that was clicked.
  const pendingFocus = useRef<'prev' | 'next' | null>(null)

  // One row per page: page size follows the column count.
  const perPage = columns
  const totalPages = Math.max(1, Math.ceil(cards.length / perPage))
  // Clamp: the list can shrink (refetch) while `firstIndex` is stale.
  const currentPage = Math.min(Math.floor(firstIndex / perPage) + 1, totalPages)
  const start = (currentPage - 1) * perPage
  const pageCards = cards.slice(start, start + perPage)

  // Re-anchor so the list growing back doesn't jump to the old page.
  if (firstIndex >= cards.length && firstIndex !== start) setFirstIndex(start)

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
            {start + 1}–{start + pageCards.length} of {cards.length}
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
