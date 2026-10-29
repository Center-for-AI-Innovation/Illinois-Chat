import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/shadcn/ui/button'
import { ChatbotHubCard } from './ChatbotHubCard'
import { type ChatbotSectionData } from './chatbots.types'

export const CHATBOTS_PER_PAGE = 5
const MIN_CARD_WIDTH = 240
const GRID_GAP = 20

const columnsForWidth = (width: number) =>
  Math.min(
    CHATBOTS_PER_PAGE,
    Math.max(1, Math.floor((width + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP))),
  )

export function ChatbotsSection({ title, cards }: ChatbotSectionData) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(CHATBOTS_PER_PAGE)
  // Index of the first visible card, so a resize keeps the user's place.
  const [firstIndex, setFirstIndex] = useState(0)

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0) setColumns(columnsForWidth(el.clientWidth))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // One row per page: page size follows the column count.
  const perPage = columns
  const totalPages = Math.max(1, Math.ceil(cards.length / perPage))
  // Clamp: the list can shrink (refetch) while `firstIndex` is stale.
  const currentPage = Math.min(Math.floor(firstIndex / perPage) + 1, totalPages)
  const start = (currentPage - 1) * perPage
  const pageCards = cards.slice(start, start + perPage)

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
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            aria-label={`Previous page of ${title}`}
            disabled={currentPage <= 1}
            onClick={() => setFirstIndex((currentPage - 2) * perPage)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span aria-live="polite" className="min-w-20 text-center">
            {start + 1}–{start + pageCards.length} of {cards.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            aria-label={`Next page of ${title}`}
            disabled={currentPage >= totalPages}
            onClick={() => setFirstIndex(currentPage * perPage)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  )
}
