'use client'

import { Input } from '@/components/shadcn/ui/input'
import { ScrollArea } from '@/components/shadcn/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/ui/table'
import { Switch } from '@/components/shadcn/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import { IconHelp, IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'

import { useFetchDocumentGroups } from '@/hooks/queries/useFetchDocumentGroups'
import { useUpdateDocGroup } from '@/hooks/queries/useUpdateDocGroup'
import { useQueryClient } from '@tanstack/react-query'

export function DocGroupsTable({ course_name }: { course_name: string }) {
  const queryClient = useQueryClient()
  const [documentGroupSearch, setDocumentGroupSearch] = useState('')

  const updateDocGroup = useUpdateDocGroup(course_name, queryClient)

  const {
    data: documentGroups,
    isLoading: isLoadingDocumentGroups,
    isError: isErrorDocumentGroups,
    refetch: refetchDocumentGroups,
  } = useFetchDocumentGroups(course_name)

  // Logic to filter doc_groups based on the search query
  const filteredDocumentGroups = useMemo(() => {
    if (!documentGroups) {
      return []
    }

    return [...documentGroups].filter((doc_group_obj) =>
      doc_group_obj.name
        ?.toLowerCase()
        .includes(documentGroupSearch?.toLowerCase()),
    )
  }, [documentGroups, documentGroupSearch])

  // Handle doc_group search change
  const handleDocumentGroupSearchChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setDocumentGroupSearch(event.target.value)
  }

  return (
    <>
      <div className="w-full px-0 py-4 md:px-2">
        <div className="relative sticky top-0 z-10 mb-2">
          <IconSearch
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-(--foreground-faded)"
          />
          <Input
            placeholder="Search by Document Group"
            aria-label="Search by Document Group"
            value={documentGroupSearch}
            onChange={handleDocumentGroupSearchChange}
            className="rounded-md border-(--foreground) bg-(--background) pl-9 text-(--foreground) focus-visible:border-(--illinois-orange)"
          />
        </div>
        <ScrollArea className="max-h-[calc(80vh-16rem)] overflow-hidden rounded-xl bg-(--dashboard-background-dark)">
          <Table
            aria-label="Document groups"
            className="document_groups_table border-separate border-spacing-0 overflow-hidden"
            style={{ tableLayout: 'fixed' }}
          >
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-(--dashboard-background-dark) hover:bg-(--dashboard-background-dark)">
                <TableHead className="w-[50%] font-semibold text-white/90 sm:w-[60%] md:w-[70%]">
                  Document Group
                </TableHead>
                <TableHead className="w-[30%] font-semibold text-white/90 sm:w-[25%] md:w-[15%]">
                  Number of Docs
                </TableHead>
                <TableHead className="w-[20%] text-center font-semibold text-white/90 sm:w-[15%]">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="flex items-center justify-center whitespace-nowrap" />
                      }
                    >
                      <span className="hidden sm:inline">Enabled</span>
                      <IconHelp
                        size={16}
                        aria-hidden="true"
                        className="ml-1"
                      />
                    </TooltipTrigger>
                    <TooltipContent
                      className="max-w-[220px] text-wrap bg-(--illinois-orange)"
                      arrowClassName="bg-(--illinois-orange) fill-(--illinois-orange)"
                    >
                      If a document is included in ANY enabled group, it will
                      be included in chatbot results. Enabled groups take
                      precedence over disabled groups.
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr]:bg-(--background) [&>tr:nth-of-type(odd)]:bg-(--background-faded)">
              {filteredDocumentGroups.map((doc_group_obj, index) => (
                <TableRow key={index}>
                  <TableCell style={{ wordWrap: 'break-word' }}>
                    <span>{doc_group_obj.name}</span>
                  </TableCell>
                  {/* <TableCell style={{ wordWrap: 'break-word' }}>
                      <span>{doc_group_obj.description}</span>
                    </TableCell> */}
                  <TableCell style={{ wordWrap: 'break-word' }}>
                    <span>{doc_group_obj.doc_count}</span>
                  </TableCell>
                  <TableCell
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      wordWrap: 'break-word',
                    }}
                  >
                    <Switch
                      checked={doc_group_obj.enabled}
                      onCheckedChange={(checked) =>
                        updateDocGroup.mutate({
                          doc_group_obj,
                          enabled: checked,
                        })
                      }
                      className={
                        doc_group_obj.enabled
                          ? 'data-checked:bg-(--dashboard-button) data-checked:border-(--dashboard-button)'
                          : 'data-unchecked:bg-(--dashboard-background-dark) data-unchecked:border-(--dashboard-background-dark)'
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filteredDocumentGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <span className="block text-center">
                      No document groups found
                    </span>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </>
  )
}
