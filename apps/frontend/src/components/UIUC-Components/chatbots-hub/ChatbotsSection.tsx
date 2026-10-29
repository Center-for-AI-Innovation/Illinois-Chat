import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/shadcn/ui/button'
import { ChatbotHubCard } from './ChatbotHubCard'
import { type ChatbotSectionData } from './chatbots.types'

export const CHATBOTS_PER_PAGE = 5

export function ChatbotsSection({ title, cards }: ChatbotSectionData) {
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(cards.length / CHATBOTS_PER_PAGE))
  // Clamp: the list can shrink (refetch) while `page` is stale.
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * CHATBOTS_PER_PAGE
  const pageCards = cards.slice(start, start + CHATBOTS_PER_PAGE)

  return (
    <section className="px-4 py-10 sm:px-8">
      <h2 className="mb-6 text-2xl font-bold text-(--illinois-blue) dark:text-white">
        {title}
      </h2>
      <div className="grid auto-rows-[minmax(436px,1fr)] grid-cols-[repeat(auto-fit,minmax(240px,290px))] justify-center gap-5 py-6">
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
            onClick={() => setPage(currentPage - 1)}
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
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  )
}
