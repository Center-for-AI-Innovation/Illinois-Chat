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
  const from = totalRecords === 0 ? 0 : (page - 1) * recordsPerPage + 1
  const to = Math.min(page * recordsPerPage, totalRecords)

  return (
    <div
      className={`flex items-center justify-between gap-2 px-2 py-2 text-sm text-(--foreground) ${className ?? ''}`}
    >
      <span aria-live="polite">
        {totalRecords === 0
          ? 'No records'
          : `${from}–${to} of ${totalRecords}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <IconChevronLeft size={16} aria-hidden="true" />
        </Button>
        <span aria-hidden="true" className="min-w-12 text-center">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <IconChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
