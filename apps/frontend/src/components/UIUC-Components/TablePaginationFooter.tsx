import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/shadcn/ui/button'

interface TablePaginationFooterProps {
  page: number
  totalRecords: number
  recordsPerPage: number
  onPageChange: (page: number) => void
  className?: string
}

/**
 * A minimal page/prev/next footer for server- or client-paginated tables.
 * Shared by `ProjectFilesTable` and `N8nWorkflowsTable` — neither exposes a
 * records-per-page selector today, so this intentionally doesn't either.
 */
export function TablePaginationFooter({
  page,
  totalRecords,
  recordsPerPage,
  onPageChange,
  className,
}: TablePaginationFooterProps) {
  const totalPages = Math.max(1, Math.ceil(totalRecords / recordsPerPage))
  // Deleting or filtering can shrink the total while the caller still holds a
  // now-out-of-range page, so clamp rather than render an impossible range
  // (e.g. `101-100 of 100`) until the caller catches up.
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const from = totalRecords === 0 ? 0 : (currentPage - 1) * recordsPerPage + 1
  const to = Math.min(currentPage * recordsPerPage, totalRecords)

  return (
    <div
      className={`flex items-center justify-between gap-2 px-2 py-2 text-sm text-(--foreground) ${className ?? ''}`}
    >
      <span aria-live="polite">
        {totalRecords === 0 ? 'No records' : `${from}–${to} of ${totalRecords}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <IconChevronLeft size={16} aria-hidden="true" />
        </Button>
        <span className="min-w-12 text-center">
          <span aria-hidden="true">
            {currentPage} / {totalPages}
          </span>
          <span className="sr-only">{`Page ${currentPage} of ${totalPages}`}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <IconChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
