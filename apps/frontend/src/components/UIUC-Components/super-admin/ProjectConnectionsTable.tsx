// The Connections tab: every project that has an external-connections row.

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Database,
  Pencil,
  Plus,
  Search,
} from 'lucide-react'
import { cva } from 'class-variance-authority'
import { useMemo, useState, type ReactNode } from 'react'
import { Badge } from '~/components/shadcn/ui/badge'
import { Button } from '~/components/shadcn/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/shadcn/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '~/components/shadcn/ui/input-group'
import { Skeleton } from '~/components/shadcn/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/shadcn/ui/table'
import {
  useFetchProjectConnections,
  type ProjectConnectionSummary,
} from '~/hooks/queries/useFetchProjectConnections'
import {
  AdminCard,
  AdminInlineError,
  adminMutedTextClass,
  adminSubtleTextClass,
} from './AdminCard'
import { AddConnectionDialog } from './AddConnectionDialog'
import { CONNECTION_PROPAGATION_NOTICE } from './admin.types'
import { ProjectConnectionEditor } from './ProjectConnectionEditor'

type SortColumn = 'project_name' | 'updated_at'
type SortDirection = 'asc' | 'desc'

const statusBadgeVariants = cva('rounded-[6px]', {
  variants: {
    active: {
      true: 'border-(--illinois-orange) bg-(--illinois-orange)/10 text-(--illinois-orange)',
      false: `border-[#e5e7eb] dark:border-[#32517a] ${adminSubtleTextClass}`,
    },
  },
})

function SortableHead({
  label,
  ariaSort,
  onSort,
  icon,
  className,
}: {
  label: string
  ariaSort: 'ascending' | 'descending' | 'none'
  onSort: () => void
  icon: ReactNode
  className?: string
}) {
  return (
    <TableHead aria-sort={ariaSort} className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onSort}
        className="-ml-3 h-8 px-3 text-sm font-semibold text-(--illinois-blue) hover:bg-(--background-faded) dark:text-white dark:hover:bg-[#0c1f3f]"
      >
        {label}
        {icon}
      </Button>
    </TableHead>
  )
}

function compareRows(
  a: ProjectConnectionSummary,
  b: ProjectConnectionSummary,
  column: SortColumn,
  direction: SortDirection,
): number {
  const factor = direction === 'asc' ? 1 : -1
  if (column === 'project_name') {
    return a.project_name.localeCompare(b.project_name) * factor
  }
  // Never-updated rows sort last regardless of direction, so the column is
  // about recency rather than about which rows happen to lack a timestamp.
  const aTime = a.updated_at ? Date.parse(a.updated_at) : null
  const bTime = b.updated_at ? Date.parse(b.updated_at) : null
  if (aTime === null && bTime === null) return 0
  if (aTime === null) return 1
  if (bTime === null) return -1
  return (aTime - bTime) * factor
}

export function ProjectConnectionsTable() {
  const { data, isPending, isError, error, refetch, isFetching } =
    useFetchProjectConnections()
  const [query, setQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('project_name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [editingProject, setEditingProject] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const addButton = (
    <Button
      type="button"
      variant="dashboard"
      size="sm"
      onClick={() => setIsAdding(true)}
      className="rounded-[8px]"
    >
      <Plus aria-hidden="true" />
      Add connection
    </Button>
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? (data ?? []).filter((row) =>
          row.project_name.toLowerCase().includes(needle),
        )
      : data ?? []
    return [...filtered].sort((a, b) =>
      compareRows(a, b, sortColumn, sortDirection),
    )
  }, [data, query, sortColumn, sortDirection])

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection('asc')
  }

  function ariaSortFor(column: SortColumn) {
    if (column !== sortColumn) return 'none' as const
    return sortDirection === 'asc'
      ? ('ascending' as const)
      : ('descending' as const)
  }

  function sortIconFor(column: SortColumn) {
    if (column !== sortColumn) {
      return <ArrowUpDown className="size-3.5 opacity-60" aria-hidden="true" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="size-3.5" aria-hidden="true" />
    ) : (
      <ArrowDown className="size-3.5" aria-hidden="true" />
    )
  }

  return (
    <>
      <AdminCard
        title="Project connections"
        blastRadius="Per-project overrides for storage, database, vector store, and embeddings. Projects without a row use the platform defaults."
        icon={<Database className="size-5" aria-hidden="true" />}
        headerAside={isError || isPending || !data?.length ? undefined : addButton}
      >
        <div className="flex flex-col gap-4">
          <p className={`text-xs ${adminSubtleTextClass}`}>
            {CONNECTION_PROPAGATION_NOTICE}
          </p>

          {isError ? (
            <AdminInlineError
              title="Could not load connections"
              message={error instanceof Error ? error.message : 'Unknown error'}
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          ) : isPending ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-9 w-full max-w-xs rounded-[8px]" />
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-[8px]" />
              ))}
            </div>
          ) : (data?.length ?? 0) === 0 ? (
            <Empty className="border border-dashed border-[#e5e7eb] p-10 dark:border-[#32517a]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Database aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No project connections</EmptyTitle>
                <EmptyDescription>
                  Every project is using the platform defaults. Add a
                  connection to point a project at its own storage, database,
                  vector store, or embedding provider.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{addButton}</EmptyContent>
            </Empty>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <InputGroup className="rounded-[8px] sm:max-w-xs">
                  <InputGroupAddon>
                    <Search aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter projects"
                    aria-label="Filter projects by name"
                  />
                </InputGroup>
                <p
                  aria-live="polite"
                  className={`text-xs ${adminSubtleTextClass}`}
                >
                  {rows.length === data?.length
                    ? `${rows.length} ${rows.length === 1 ? 'project' : 'projects'}`
                    : `${rows.length} of ${data?.length ?? 0} projects`}
                </p>
              </div>

              {/* Horizontal scroll container comes from <Table>; the
                  lower-priority columns hide below md so the project name and
                  the row action are never squeezed. */}
              <div className="overflow-hidden rounded-[10px] ring-1 ring-[#e5e7eb] dark:ring-[#32517a]">
                <Table>
                  <TableHeader className="bg-(--background-faded) dark:bg-[#0c1f3f]">
                    <TableRow className="hover:bg-transparent dark:border-[#32517a]">
                      <SortableHead
                        label="Project"
                        ariaSort={ariaSortFor('project_name')}
                        onSort={() => toggleSort('project_name')}
                        icon={sortIconFor('project_name')}
                        className="pl-4"
                      />
                      <TableHead className="font-semibold text-(--illinois-blue) dark:text-white">
                        Status
                      </TableHead>
                      <TableHead className="hidden font-semibold text-(--illinois-blue) md:table-cell dark:text-white">
                        Configured
                      </TableHead>
                      <SortableHead
                        label="Updated"
                        ariaSort={ariaSortFor('updated_at')}
                        onSort={() => toggleSort('updated_at')}
                        icon={sortIconFor('updated_at')}
                        className="hidden md:table-cell"
                      />
                      <TableHead className="pr-4 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow className="hover:bg-transparent dark:border-[#32517a]">
                        <TableCell
                          colSpan={5}
                          className={`py-10 text-center text-sm ${adminSubtleTextClass}`}
                        >
                          No project matches “{query}”.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => (
                        <TableRow
                          key={row.project_name}
                          className="dark:border-[#32517a] dark:hover:bg-[#0c1f3f]/60"
                        >
                          <TableCell className="max-w-[220px] pl-4 font-medium text-(--illinois-blue) dark:text-white">
                            <span className="block min-w-0 truncate">
                              {row.project_name}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusBadgeVariants({
                                active: row.is_active,
                              })}
                            >
                              {row.is_active ? 'Active' : 'Disabled'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex flex-wrap gap-1.5">
                              {row.configured_kinds.length === 0 ? (
                                <span
                                  className={`text-sm ${adminSubtleTextClass}`}
                                >
                                  None
                                </span>
                              ) : (
                                row.configured_kinds.map((kind) => (
                                  <Badge
                                    key={kind}
                                    variant="secondary"
                                    className="rounded-[6px] capitalize"
                                  >
                                    {kind}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className={`hidden text-sm whitespace-nowrap md:table-cell ${adminMutedTextClass}`}
                          >
                            {row.updated_at
                              ? new Date(row.updated_at).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Edit connections for ${row.project_name}`}
                              onClick={() =>
                                setEditingProject(row.project_name)
                              }
                              className="rounded-[8px] text-(--illinois-blue) dark:text-white"
                            >
                              <Pencil aria-hidden="true" />
                              <span className="hidden sm:inline">Edit</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </AdminCard>

      <AddConnectionDialog
        open={isAdding}
        onOpenChange={setIsAdding}
        onSelect={(projectName) => {
          setIsAdding(false)
          setEditingProject(projectName)
        }}
      />

      {editingProject && (
        <ProjectConnectionEditor
          projectName={editingProject}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingProject(null)
          }}
        />
      )}
    </>
  )
}
