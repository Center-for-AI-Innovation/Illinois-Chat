// The Frozen projects tab: lists projects that are hidden from every listing and
// blocked for ordinary access, and lets a super admin recover one.

import { Snowflake } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/shadcn/ui/alert-dialog'
import { Badge } from '~/components/shadcn/ui/badge'
import { Button } from '~/components/shadcn/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/shadcn/ui/empty'
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
  useFetchFrozenProjects,
  type FrozenProjectSummary,
} from '~/hooks/queries/useFetchFrozenProjects'
import {
  FrozenProjectRecoveryPartialError,
  useRecoverFrozenProject,
} from '~/hooks/queries/useRecoverFrozenProject'
import {
  AdminCard,
  AdminInlineError,
  AdminInlineWarning,
  adminMutedTextClass,
  adminSubtleTextClass,
} from './AdminCard'

export function FrozenProjectsCard() {
  const { data, isPending, isError, error, refetch, isFetching } =
    useFetchFrozenProjects()
  const recover = useRecoverFrozenProject()
  const [candidate, setCandidate] = useState<FrozenProjectSummary | null>(null)
  const [recoverError, setRecoverError] = useState<string | null>(null)
  const [recoverWarning, setRecoverWarning] = useState<string | null>(null)
  const [recoveredName, setRecoveredName] = useState<string | null>(null)

  async function confirmRecovery(project: FrozenProjectSummary) {
    setRecoverError(null)
    setRecoverWarning(null)
    setRecoveredName(null)
    try {
      await recover.mutateAsync(project.course_name)
      setRecoveredName(project.course_name)
    } catch (err) {
      if (err instanceof FrozenProjectRecoveryPartialError) {
        // Unfrozen, so the list refreshes without it. Only the audit row is
        // unresolved, and that needs attention rather than a failure message.
        setRecoverWarning(err.message)
      } else {
        setRecoverError(err instanceof Error ? err.message : 'Unknown error')
      }
    }
  }

  return (
    <>
      <AdminCard
        title="Frozen projects"
        blastRadius="Frozen projects are hidden from every listing and blocked for everyone, including their owners. Recovering one makes it visible and usable again."
        icon={<Snowflake className="size-5" aria-hidden="true" />}
      >
        <div className="flex flex-col gap-4">
          {recoverError && (
            <AdminInlineError
              title="Could not recover the project"
              message={recoverError}
            />
          )}
          {recoverWarning && (
            <AdminInlineWarning
              title="Project recovered; audit needs attention"
              message={recoverWarning}
            />
          )}
          {recoveredName && (
            <p role="status" className={`text-sm ${adminMutedTextClass}`}>
              Recovered “{recoveredName}”. It is visible in project listings
              again.
            </p>
          )}

          {isError ? (
            <AdminInlineError
              title="Could not load frozen projects"
              message={error instanceof Error ? error.message : 'Unknown error'}
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          ) : isPending ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-[8px]" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <Empty className="border border-dashed border-[#e5e7eb] p-10 dark:border-[#32517a]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Snowflake aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No frozen projects</EmptyTitle>
                <EmptyDescription>
                  Every project is currently available. A project appears here
                  when it has been frozen by an administrator.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-[10px] ring-1 ring-[#e5e7eb] dark:ring-[#32517a]">
              <Table>
                <TableHeader className="bg-(--background-faded) dark:bg-[#0c1f3f]">
                  <TableRow className="hover:bg-transparent dark:border-[#32517a]">
                    <TableHead className="pl-4 font-semibold text-(--illinois-blue) dark:text-white">
                      Project
                    </TableHead>
                    <TableHead className="hidden font-semibold text-(--illinois-blue) md:table-cell dark:text-white">
                      Owner
                    </TableHead>
                    <TableHead className="font-semibold text-(--illinois-blue) dark:text-white">
                      Visibility
                    </TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((project) => {
                    const isRecovering =
                      recover.isPending &&
                      recover.variables === project.course_name
                    return (
                      <TableRow
                        key={project.course_name}
                        className="dark:border-[#32517a] dark:hover:bg-[#0c1f3f]/60"
                      >
                        <TableCell className="max-w-[220px] pl-4 font-medium text-(--illinois-blue) dark:text-white">
                          <span className="block min-w-0 truncate">
                            {project.course_name}
                          </span>
                        </TableCell>
                        <TableCell
                          className={`hidden max-w-[260px] text-sm md:table-cell ${adminMutedTextClass}`}
                        >
                          <span className="block min-w-0 truncate">
                            {project.course_owner ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-[6px]">
                            {project.is_private ? 'Private' : 'Public'}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={recover.isPending}
                            aria-label={`Recover ${project.course_name}`}
                            onClick={() => setCandidate(project)}
                            className="rounded-[8px] text-(--illinois-blue) dark:text-white"
                          >
                            {isRecovering ? 'Recovering…' : 'Recover'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!isPending && !isError && data.length > 0 && (
            <p className={`text-xs ${adminSubtleTextClass}`}>
              {data.length} frozen {data.length === 1 ? 'project' : 'projects'}.
            </p>
          )}
        </div>
      </AdminCard>

      <AlertDialog
        open={candidate !== null}
        onOpenChange={(open) => {
          if (!open) setCandidate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Recover “{candidate?.course_name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This clears the freeze. The project will reappear in listings and
              its users can open it again. No other setting changes. Your email
              and the time are recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!candidate) return
                // Close the dialog; progress shows on the row and any failure
                // stays in the card, where it persists.
                setCandidate(null)
                void confirmRecovery(candidate)
              }}
            >
              Recover project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
