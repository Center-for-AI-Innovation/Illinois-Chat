import dayjs from 'dayjs'
import { useEffect, useState } from 'react'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/shadcn/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/ui/table'
import { type UIUCTool } from '~/types/chat'
import { useFetchAllWorkflows } from '~/utils/functionCalling/handleFunctionCalling'
import { showToast } from '~/utils/toastUtils'
import { LoadingSpinner } from './LoadingSpinner'
import { TablePaginationFooter } from './TablePaginationFooter'

const PAGE_SIZE = 25

interface N8nWorkflowsTableProps {
  n8nApiKey: string
  course_name: string
  isEmptyWorkflowTable: boolean
  sidebarCollapsed?: boolean
}

export const N8nWorkflowsTable = ({
  n8nApiKey,
  course_name,
  isEmptyWorkflowTable,
  sidebarCollapsed = false,
}: N8nWorkflowsTableProps) => {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  // Get responsive width classes based on sidebar state
  const widthClasses = sidebarCollapsed
    ? 'w-[96%] md:w-[98%] lg:w-[96%] xl:w-[94%] 2xl:w-[92%]' // More space when sidebar collapsed
    : 'w-[96%] md:w-[94%] lg:w-[92%] xl:w-[90%] 2xl:w-[88%]' // Less space when sidebar expanded

  const {
    data: records,
    isLoading: isLoadingRecords,
    refetch: refetchWorkflows,
  } = useFetchAllWorkflows(course_name, n8nApiKey, 20, 'true', true)

  const mutate_active_flows = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const response = await fetch(
        `/api/UIUC-api/tools/activateWorkflow?api_key=${n8nApiKey}&id=${id}&activate=${checked}`,
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      return data
    },
    onError: (error) => {
      showToast({
        title: 'Error with activation',
        message: (error as Error).message,
        type: 'error',
        autoClose: 12000,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['tools', n8nApiKey],
      })
    },
  })

  useEffect(() => {
    // Refetch if API key changes
    refetchWorkflows()
  }, [n8nApiKey])

  const startIndex = (page - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE

  let currentRecords: UIUCTool[] | undefined

  if (records && records.length !== 0) {
    const sortedRecords = [...records].sort((a, b) => {
      const dateA = new Date(a.createdAt as string)
      const dateB = new Date(b.createdAt as string)
      return dateB.getTime() - dateA.getTime()
    })
    currentRecords = (sortedRecords as UIUCTool[]).slice(startIndex, endIndex)
  }

  const visibleRecords = isEmptyWorkflowTable ? [] : (currentRecords ?? [])

  return (
    <>
      <p className={`pb-2 text-(--dashboard-foreground) ${widthClasses}`}>
        These tools can be automatically invoked by the LLM to fetch additional
        data to answer user questions on the{' '}
        <a
          href={`/${course_name}/chat`}
          rel="noopener noreferrer"
          className="text-(--dashboard-button) underline hover:text-(--dashboard-button-hover)"
        >
          chat page
        </a>
        .
      </p>

      <div className={`n8n_workflows_table ${widthClasses}`}>
        <div className="max-h-[500px] overflow-auto rounded-md border border-(--table-border)">
          <Table aria-label="n8n workflows">
            <TableHeader className="sticky top-0 z-10 bg-(--background)">
              <TableRow>
                <TableHead className="text-(--table-header)">Name</TableHead>
                <TableHead className="w-25 text-(--table-header)">
                  Enabled
                </TableHead>
                <TableHead className="text-(--table-header)">Tags</TableHead>
                <TableHead className="text-(--table-header)">
                  Created At
                </TableHead>
                <TableHead className="text-(--table-header)">
                  Updated At
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingRecords ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <LoadingSpinner />
                  </TableCell>
                </TableRow>
              ) : visibleRecords.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center whitespace-normal text-(--foreground)"
                  >
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                visibleRecords.map((record, index) => {
                  const active = (record as { active?: boolean }).active
                  return (
                    <TableRow
                      key={record.id}
                      className={
                        index % 2 === 0
                          ? 'bg-(--background)'
                          : 'bg-(--background-faded)'
                      }
                    >
                      <TableCell className="whitespace-normal break-words text-(--foreground)">
                        {record.name}
                      </TableCell>
                      <TableCell>
                        <Switch
                          variant="labeled"
                          size="sm"
                          checked={!!active}
                          aria-label={`Enable ${record.name || 'workflow'}`}
                          onCheckedChange={(checked) => {
                            mutate_active_flows.mutate({
                              id: record.id,
                              checked,
                            })
                          }}
                        />
                      </TableCell>
                      <TableCell className="whitespace-normal break-words text-(--foreground)">
                        {record.tags
                          ? record.tags.map((tag) => tag.name).join(', ')
                          : ''}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-(--foreground)">
                        {dayjs(record.createdAt).format('MMM D YYYY, h:mm A')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-(--foreground)">
                        {record.updatedAt
                          ? dayjs(record.updatedAt).format(
                              'MMM D YYYY, h:mm A',
                            )
                          : ''}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        <TablePaginationFooter
          page={page}
          totalRecords={records?.length || 0}
          recordsPerPage={PAGE_SIZE}
          onPageChange={setPage}
          className="bg-(--background)"
        />
      </div>
    </>
  )
}
