// Step one of adding a connection: pick a project that does not have one yet.
// Step two is the regular editor, which already handles first-time configs.

import { ChevronRight, FolderSearch, Loader2, Search } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/shadcn/ui/dialog'
import {
  Empty,
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
import { Item, ItemActions, ItemContent, ItemTitle } from '~/components/shadcn/ui/item'
import { Skeleton } from '~/components/shadcn/ui/skeleton'
import { useFetchConnectionCandidates } from '~/hooks/queries/useFetchProjectConnections'
import { useDebounce } from '~/hooks/useDebounce'
import { AdminInlineError, adminSubtleTextClass } from './AdminCard'

interface AddConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (projectName: string) => void
}

export function AddConnectionDialog({
  open,
  onOpenChange,
  onSelect,
}: AddConnectionDialogProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query.trim(), 250)
  const { data, isPending, isError, error, refetch, isFetching } =
    useFetchConnectionCandidates(debouncedQuery, { enabled: open })

  const projects = data?.projects ?? []
  const isCapped = data !== undefined && projects.length >= data.limit

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="overflow-x-hidden rounded-[14px] bg-white sm:max-w-lg dark:bg-[#13294b] dark:ring-[#32517a]">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg font-semibold text-(--illinois-blue) dark:text-white">
            Add project connection
          </DialogTitle>
          <DialogDescription className="text-(--illinois-storm-dark) dark:text-[#c8d2e3]">
            Pick a project to give it its own storage, database, vector store,
            or embedding settings. Projects that already have overrides are
            edited from the table instead.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <InputGroup className="rounded-[8px]">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              autoFocus
              maxLength={100}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects without a connection"
              aria-controls="connection-candidates"
            />
            {isFetching && !isPending && (
              <InputGroupAddon align="inline-end">
                <Loader2 className="animate-spin" aria-hidden="true" />
              </InputGroupAddon>
            )}
          </InputGroup>

          {isError ? (
            <AdminInlineError
              title="Could not search projects"
              message={error instanceof Error ? error.message : 'Unknown error'}
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          ) : isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-full rounded-[8px]" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Empty className="border border-dashed border-[#e5e7eb] p-8 dark:border-[#32517a]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderSearch aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {debouncedQuery ? 'No matching projects' : 'No projects available'}
                </EmptyTitle>
                <EmptyDescription>
                  {debouncedQuery
                    ? `No project without a connection matches “${debouncedQuery}”.`
                    : 'Every project already has a connection row, or no projects exist yet.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ul
                id="connection-candidates"
                aria-label="Projects without a connection"
                className="-mx-1 flex max-h-72 flex-col gap-1 overflow-y-auto px-1 py-1"
              >
                {projects.map((projectName) => (
                  <li key={projectName}>
                    <Item
                      size="sm"
                      variant="outline"
                      render={<button type="button" />}
                      onClick={() => {
                        setQuery('')
                        onSelect(projectName)
                      }}
                      className="cursor-pointer rounded-[8px] border-[#e5e7eb] text-left hover:bg-(--background-faded) dark:border-[#32517a] dark:hover:bg-[#0c1f3f]"
                    >
                      <ItemContent className="min-w-0">
                        <ItemTitle className="block w-full truncate font-medium text-(--illinois-blue) dark:text-white">
                          {projectName}
                        </ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <ChevronRight
                          className={`size-4 ${adminSubtleTextClass}`}
                          aria-hidden="true"
                        />
                      </ItemActions>
                    </Item>
                  </li>
                ))}
              </ul>
              <p
                aria-live="polite"
                className={`text-xs ${adminSubtleTextClass}`}
              >
                {isCapped
                  ? `Showing the first ${projects.length}. Keep typing to narrow it down.`
                  : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} without a connection`}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
