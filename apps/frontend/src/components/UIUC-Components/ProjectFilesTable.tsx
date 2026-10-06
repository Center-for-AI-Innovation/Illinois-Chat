'use client'

import {
  IconArrowsSort,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconEye,
  IconFilter,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import axios from 'axios'
import { createRef, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/shadcn/ui/badge'
import { Button } from '@/components/shadcn/ui/button'
import { Checkbox } from '@/components/shadcn/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/ui/dialog'
import { Input } from '@/components/shadcn/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/shadcn/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'

import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { useRouter } from 'next/router'
import {
  type CourseDocument,
  type DocumentGroup,
} from 'src/types/courseMaterials'
import { useAppendToDocGroup } from '@/hooks/queries/useAppendToDocGroup'
import { useFetchDocumentGroups } from '@/hooks/queries/useFetchDocumentGroups'
import { useDeleteFromDocGroup } from '@/hooks/queries/useDeleteFromDocGroup'

import { handleExport } from '~/utils/handleExport'
import { fetchPresignedUrl } from '~/utils/apiUtils'
import { showErrorToast, showToast } from '~/utils/toastUtils'
import { DocGroupMultiSelect } from './DocGroupMultiSelect'
import { LoadingSpinner } from './LoadingSpinner'
import { showToastOnUpdate } from './MakeQueryAnalysisPage'
import { TablePaginationFooter } from './TablePaginationFooter'

const PAGE_SIZE = 100

// The table refreshes on a slow interval (plus window-focus refetch and the
// event-driven invalidations fired by the upload pollers); the refresh button
// refetches immediately, which also restarts this countdown.
const TABLE_REFRESH_INTERVAL_MS = 5 * 60_000

/*
 * react-query hands back freshly constructed objects on every refetch, so
 * selection has to be tracked by a stable key (the previous table
 * implementation used its own id accessor) rather than by object identity, or
 * the checkboxes desync from `selectedRecords` the first time the table
 * refreshes.
 */
const getRecordKey = (record: CourseDocument): string | number | null =>
  record.id ?? record.s3_path ?? record.url ?? null

const isSameRecord = (a: CourseDocument, b: CourseDocument): boolean => {
  const aKey = getRecordKey(a)
  const bKey = getRecordKey(b)
  return aKey !== null && bKey !== null ? aKey === bKey : a === b
}

type SortDirection = 'asc' | 'desc'
interface SortStatus {
  columnAccessor: string
  direction: SortDirection
}

/*
 * This table is drawn as a full grid. The shared shadcn <Table> only draws row
 * separators, so the vertical dividers and the `--table-border` color are
 * applied here rather than in `table.tsx`, which every other table in the app
 * also renders.
 */
const TABLE_GRID_CLASSES = [
  '[&_tr]:border-(--table-border)',
  '[&_th]:border-(--table-border)',
  '[&_td]:border-(--table-border)',
  '[&_th:not(:last-child)]:border-r',
  '[&_td:not(:last-child)]:border-r',
].join(' ')

function SortableColumnHeader({
  label,
  accessor,
  sortStatus,
  onSortStatusChange,
}: {
  label: string
  accessor: string
  sortStatus: SortStatus
  onSortStatusChange: (next: SortStatus) => void
}) {
  const isActive = sortStatus.columnAccessor === accessor
  return (
    <button
      type="button"
      className="flex items-center gap-1 font-medium"
      onClick={() =>
        onSortStatusChange({
          columnAccessor: accessor,
          direction:
            isActive && sortStatus.direction === 'asc' ? 'desc' : 'asc',
        })
      }
    >
      {label}
      {isActive ? (
        sortStatus.direction === 'asc' ? (
          <IconChevronUp size={14} aria-hidden="true" />
        ) : (
          <IconChevronDown size={14} aria-hidden="true" />
        )
      ) : (
        <IconArrowsSort size={14} aria-hidden="true" className="opacity-50" />
      )}
    </button>
  )
}

/*
 * Each column's filter sits behind a funnel icon that opens a popover, which
 * keeps the header a single compact row — an always-visible input under every
 * label doubles the header's height.
 */
function FilterPopover({
  label,
  placeholder,
  columnKey,
  filterKey,
  filterValue,
  onFilterChange,
}: {
  label: string
  placeholder: string
  columnKey: string
  filterKey: string
  filterValue: string
  onFilterChange: (key: string, value: string) => void
}) {
  const isActive = filterKey === columnKey
  const hasValue = isActive && filterValue !== ''
  // The trigger is this column's only filter control, so it takes the
  // "Filter by ..." name; the input inside the popover keeps the plain
  // column label.
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Filter by ${label}`}
            className={`rounded border p-1 transition-colors ${
              hasValue
                ? 'border-(--dashboard-button) text-(--dashboard-button)'
                : 'border-(--table-border) text-(--foreground-faded) hover:text-(--foreground)'
            }`}
          />
        }
      >
        <IconFilter size={14} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-2 p-2">
        <div className="relative">
          <Input
            aria-label={label}
            placeholder={placeholder}
            value={isActive ? filterValue : ''}
            onChange={(e) => onFilterChange(columnKey, e.target.value)}
            className="h-8 pr-7 text-xs"
          />
          {hasValue && (
            <button
              type="button"
              aria-label={`Clear ${label} filter`}
              onClick={() => onFilterChange(columnKey, '')}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-(--foreground-faded) hover:text-(--foreground)"
            >
              <IconX size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ProjectFilesTable({
  course_name,
  setFailedCount = (count: number) => {},
  tabValue,
  onTabChange,
  failedCount = 0,
}: {
  course_name: string
  setFailedCount?: (count: number) => void
  tabValue: string
  onTabChange: (value: string) => void
  failedCount?: number
}) {
  const queryClient = useQueryClient()
  const [selectedRecords, setSelectedRecords] = useState<CourseDocument[]>([])
  const [filterKey, setFilterKey] = useState<string>('')
  const [filterValue, setFilterValue] = useState<string>('')
  const [modalOpened, setModalOpened] = useState(false)
  const [recordsToDelete, setRecordsToDelete] = useState<CourseDocument[]>([])
  const [page, setPage] = useState(1)
  const [sortStatus, setSortStatus] = useState<SortStatus>({
    columnAccessor: 'created_at',
    direction: 'desc',
  })
  const [errorModalOpened, setErrorModalOpened] = useState(false)
  const [currentError, setCurrentError] = useState('')
  const isSmallScreen = useMediaQuery('(max-width: 768px)')
  const isBetweenSmallAndMediumScreen = useMediaQuery('(max-width: 878px)')
  const [showMultiSelect, setShowMultiSelect] = useState(false)
  const [isDeletingDocuments, setIsDeletingDocuments] = useState(false)
  const [exportModalOpened, setExportModalOpened] = useState(false)
  const [showDeleteButton, setShowDeleteButton] = useState(false)
  const [selectedCount, setSelectedCount] = useState(0)
  const [copiedError, setCopiedError] = useState(false)
  const router = useRouter()

  const getCurrentPageName = () => {
    return router.asPath.slice(1).split('/')[0] as string
  }
  const openModel = (open: boolean, error = '') => {
    setErrorModalOpened(open)
    setCurrentError(error)
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilterKey(key)
    setFilterValue(value)
  }

  const appendToDocGroup = useAppendToDocGroup(course_name, queryClient, page)
  const removeFromDocGroup = useDeleteFromDocGroup(
    course_name,
    queryClient,
    page,
  )

  // State to track overflow status of error column in each row of failed documents
  const [overflowStates, setOverflowStates] = useState<{
    [key: number]: boolean
  }>({})

  // Refs for each row of failed documents
  const textRefs = useRef<{
    [key: number]: React.RefObject<HTMLDivElement | null>
  }>({})
  const multiSelectRef = useRef<HTMLDivElement>(null)
  const [selectedDocGroups, setSelectedDocGroups] = useState<string[]>([])

  // ------------- Queries -------------
  const {
    data: documents,
    isLoading: isLoadingDocuments,
    isError: isErrorDocuments,
    refetch: refetchDocuments,
  } = useQuery({
    refetchInterval: TABLE_REFRESH_INTERVAL_MS,
    queryKey: [
      'documents',
      course_name,
      page,
      filterKey,
      filterValue,
      sortStatus.columnAccessor,
      sortStatus.direction,
    ],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const response = await fetch(
        `/api/materialsTable/fetchProjectMaterials?from=${from}&to=${to}&course_name=${course_name}&filter_key=${filterKey}&filter_value=${filterValue}&sort_column=${sortStatus.columnAccessor}&sort_direction=${sortStatus.direction}`,
      )
      if (!response.ok) {
        throw new Error('Failed to fetch document groups')
      }

      const data = await response.json()
      return data
    },
  })

  const {
    data: failedDocuments,
    isLoading: isLoadingFailedDocuments,
    refetch: refetchFailedDocuments,
  } = useQuery({
    refetchInterval: TABLE_REFRESH_INTERVAL_MS,
    queryKey: [
      'failedDocuments',
      course_name,
      page,
      filterKey,
      filterValue,
      sortStatus.columnAccessor,
      sortStatus.direction,
    ],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const response = await fetch(
        `/api/materialsTable/fetchFailedDocuments?from=${from}&to=${to}&course_name=${course_name}&filter_key=${filterKey}&filter_value=${filterValue}&sort_column=${sortStatus.columnAccessor}&sort_direction=${sortStatus.direction}`,
      )
      if (!response.ok) {
        throw new Error('Failed to fetch failed documents')
      }
      const failedDocumentsResponse = await response.json()
      setFailedCount(failedDocumentsResponse.recent_fail_count)
      return failedDocumentsResponse
    },
  })

  const {
    data: documentGroups,
    isLoading: isLoadingDocumentGroups,
    refetch: refetchDocumentGroups,
  } = useFetchDocumentGroups(course_name)

  // react-query re-arms refetchInterval after every successful fetch, so a
  // manual refresh also restarts the countdown.
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const handleManualRefresh = () => {
    setIsManualRefreshing(true)
    void Promise.allSettled([
      refetchDocuments(),
      refetchFailedDocuments(),
      refetchDocumentGroups(),
    ]).finally(() => setIsManualRefreshing(false))
  }

  useEffect(() => {
    if (tabValue === 'failed') {
      const newOverflowStates: { [key: number]: boolean } = {}
      Object.keys(textRefs.current).forEach((key) => {
        const index = Number(key)
        const currentRef = textRefs.current[index]
        if (currentRef && currentRef.current) {
          const isOverflowing =
            currentRef.current.scrollHeight > currentRef.current.clientHeight
          newOverflowStates[index] = isOverflowing
        }
      })
      setOverflowStates(newOverflowStates)
    }
  }, [failedDocuments, tabValue])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        multiSelectRef.current &&
        event.target instanceof Node &&
        !multiSelectRef.current.contains(event.target)
      ) {
        setShowMultiSelect(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  async function addDocumentsToDocGroups(
    records: CourseDocument[],
    newSelectedGroups: string[],
  ) {
    const addDocGroupPromises = records.map((record) =>
      handleDocumentGroupsChange(record, [
        ...newSelectedGroups,
        ...(record.doc_groups || []),
      ]),
    )
    await Promise.all(addDocGroupPromises)
  }

  async function handleDocumentGroupsChange(
    record: CourseDocument,
    newSelectedGroups: string[],
  ) {
    const doc_groups = record.doc_groups ? record.doc_groups : []

    const removedGroups = doc_groups.filter(
      (group: any) => !newSelectedGroups.includes(group),
    )
    const appendedGroups = newSelectedGroups.filter(
      (group) => !doc_groups.includes(group),
    )

    if (removedGroups.length > 0) {
      for (const removedGroup of removedGroups) {
        await removeFromDocGroup.mutate({
          record,
          removedGroup,
        })
      }
    }
    if (appendedGroups.length > 0) {
      for (const appendedGroup of appendedGroups) {
        await appendToDocGroup.mutate({
          record,
          appendedGroup,
        })
      }
    }
  }

  const deleteDocumentMutation = useMutation({
    mutationFn: async (recordsToDelete: CourseDocument[]) => {
      console.debug('Deleting records:', recordsToDelete)
      const deletePromises = recordsToDelete.map((record) =>
        axios.delete(`/api/UIUC-api/deleteDocument`, {
          params: {
            course_name: record.course_name,
            s3_path: record.s3_path,
            url: record.url,
          },
        }),
      )
      await Promise.all(deletePromises)
      console.debug('Deleted records')
    },
    onMutate: async (recordsToDelete) => {
      console.debug('in onMutate')
      await queryClient.cancelQueries({ queryKey: ['documents', course_name] })

      const previousDocuments = queryClient.getQueryData<CourseDocument[]>([
        'documents',
        course_name,
      ])

      const previousDocumentGroups = queryClient.getQueryData([
        'documentGroups',
        course_name,
      ])

      queryClient.setQueryData<CourseDocument[]>(
        ['documents', course_name],
        (old = []) => {
          return old.filter(
            (doc) =>
              !recordsToDelete.find(
                (record) =>
                  (record.s3_path && record.s3_path === doc.s3_path) ||
                  (record.url && record.url === doc.url),
              ),
          )
        },
      )

      queryClient.setQueryData<DocumentGroup[]>(
        ['documentGroups', course_name],
        (old = []) => {
          return old.map((doc_group) => {
            const decrement = recordsToDelete.reduce((count, record) => {
              if (record.doc_groups?.includes(doc_group.name)) {
                return count + 1
              }
              return count
            }, 0)
            if (decrement === 0) return doc_group
            return {
              ...doc_group,
              doc_count: Math.max(0, (doc_group.doc_count || 0) - decrement),
            }
          })
        },
      )

      return { previousDocuments, previousDocumentGroups }
    },
    onError: (err, variables, context) => {
      console.debug('Error deleting documents:', err)
      if (context?.previousDocuments) {
        queryClient.setQueryData(
          ['documents', course_name],
          context.previousDocuments,
        )
      }

      if (context?.previousDocumentGroups) {
        queryClient.setQueryData(
          ['documentGroups', course_name],
          context.previousDocumentGroups,
        )
      }

      showToastOnFileDeleted(true)
    },
    onSuccess: () => {
      showToastOnFileDeleted()
    },
    onSettled: async () => {
      setShowDeleteButton(false)
      setSelectedCount(0)
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms))
      console.debug('sleeping for 500ms')
      await sleep(500)
      console.debug('Invalidating queries')
      queryClient.invalidateQueries({ queryKey: ['documents', course_name] })
      queryClient.invalidateQueries({
        queryKey: ['documentGroups', course_name],
      })
    },
  })

  if (isErrorDocuments) {
    showErrorToast('Failed to fetch documents', 'Error')

    return <ErrorStateForProjectFilesTable />
  }

  const showToastOnFileDeleted = (was_error = false) => {
    return showToast({
      autoClose: 5000,
      title: was_error ? 'Error deleting file' : 'Deleting file...',
      message: was_error
        ? "An error occurred while deleting the file. Please try again and I'd be so grateful if you email rohan13@illinois.edu to report this bug."
        : 'The file is being deleted in the background.',
      type: was_error ? 'error' : 'success',
    })
  }

  const activeDocuments = tabValue === 'failed' ? failedDocuments : documents
  const records: CourseDocument[] = activeDocuments?.final_docs ?? []
  const totalRecords: number = activeDocuments?.total_count ?? 0
  const isLoading =
    isLoadingDocuments ||
    isLoadingFailedDocuments ||
    isLoadingDocumentGroups ||
    isDeletingDocuments ||
    appendToDocGroup.isPending ||
    removeFromDocGroup.isPending

  const allSelectableChecked =
    tabValue !== 'failed' &&
    records.length > 0 &&
    records.every((record) =>
      selectedRecords.some((selected) => isSameRecord(selected, record)),
    )
  const someSelected =
    tabValue !== 'failed' &&
    records.some((record) =>
      selectedRecords.some((selected) => isSameRecord(selected, record)),
    ) &&
    !allSelectableChecked

  const handleSelectedRecordsChange = (
    newSelectedRecords: CourseDocument[],
  ) => {
    if (newSelectedRecords.length > 0) {
      setSelectedRecords(newSelectedRecords)
      setShowDeleteButton(true)
      setSelectedCount(newSelectedRecords.length)
      console.debug('New selection:', newSelectedRecords)

      const commonDocGroups = newSelectedRecords.reduce(
        (commonGroups: string[], record) => {
          const recordGroups = record.doc_groups || []
          return commonGroups.filter((group) => recordGroups.includes(group))
        },
        newSelectedRecords[0]?.doc_groups || [],
      )

      setSelectedDocGroups(commonDocGroups)
    } else {
      setSelectedRecords([])
      setSelectedDocGroups([])
      setShowDeleteButton(false)
      setSelectedCount(0)
    }
  }

  const toggleRecordSelected = (record: CourseDocument, checked: boolean) => {
    const without = selectedRecords.filter(
      (selected) => !isSameRecord(selected, record),
    )
    const next = checked ? [...without, record] : without
    handleSelectedRecordsChange(next)
  }

  const documentGroupOptions = documentGroups
    ? documentGroups.map((doc_group) => ({
        value: doc_group.name || '',
        label: doc_group.name || '',
      }))
    : []

  const fileNameWidth = isSmallScreen ? '35%' : '20%'
  const urlWidth = isBetweenSmallAndMediumScreen ? '12%' : '14%'
  const startingUrlWidth = isBetweenSmallAndMediumScreen ? '11%' : '14%'

  return (
    <div className="flex h-[80vh] flex-col">
      {/* Fixed Header Section */}
      <div className="flex-none">
        <div className="flex items-center justify-between px-4 pt-4 sm:px-6 md:px-8">
          <div className="flex items-center md:space-x-4">
            <button
              onClick={() => onTabChange('success')}
              className={`rounded-t-lg px-4 py-3 font-medium transition-colors duration-200 ${
                tabValue === 'success'
                  ? 'border border-(--table-border) bg-(--background) text-(--dashboard-foreground)'
                  : 'border border-transparent bg-(--dashboard-background) text-(--foreground) hover:bg-(--dashboard-background-faded) hover:text-(--foreground)'
              } ${montserrat_heading.variable} font-montserratHeading`}
            >
              Success
            </button>

            <div className="relative inline-flex">
              <button
                onClick={() => onTabChange('failed')}
                className={`rounded-t-lg px-4 py-3 font-medium duration-200 ${
                  tabValue === 'failed'
                    ? 'border border-(--table-border) bg-(--background) text-(--dashboard-foreground)'
                    : 'border border-transparent bg-(--dashboard-background) text-(--foreground) hover:bg-(--dashboard-background-faded) hover:text-(--foreground)'
                } ${montserrat_heading.variable} font-montserratHeading`}
              >
                Failed
              </button>
              {failedCount > 0 && (
                <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 justify-center rounded-full bg-(--dashboard-button) px-1 text-[10px] text-(--dashboard-button-foreground)">
                  {failedCount}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    onClick={handleManualRefresh}
                    aria-label="Refresh documents table"
                    variant="ghost"
                    size="icon-lg"
                    disabled={isManualRefreshing}
                    className="text-(--foreground) transition-colors duration-300 hover:bg-(--dashboard-background-faded) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dashboard-button)"
                  />
                }
              >
                <IconRefresh
                  size={20}
                  aria-hidden="true"
                  className={isManualRefreshing ? 'animate-spin' : undefined}
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-wrap">
                Table auto-refreshes every 5 minutes (and when you return to
                this tab). Click to refresh now.
              </TooltipContent>
            </Tooltip>
            {tabValue !== 'failed' && (
              <Button
                type="button"
                variant="dashboard"
                onClick={() => setExportModalOpened(true)}
                className={`w-full border-0 bg-(--dashboard-button) px-4 py-2 text-xs text-(--dashboard-button-foreground) transition-colors duration-300 hover:bg-(--dashboard-button-hover) sm:w-auto sm:px-6 sm:py-3 ${montserrat_paragraph.variable} font-montserratParagraph focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dashboard-button)`}
              >
                Export
              </Button>
            )}
            {tabValue !== 'failed' && selectedRecords.length > 0 && (
              <div className="w-full bg-transparent sm:w-auto">
                <div className="relative mb-2 flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="dashboard"
                          onClick={() => {
                            setShowMultiSelect(true)
                          }}
                          className={`mb-2 w-full bg-(--dashboard-button) px-4 py-2 text-xs text-(--dashboard-button-foreground) transition-colors duration-300 hover:bg-(--dashboard-button-hover) sm:mb-0 sm:w-auto sm:px-6 sm:py-3 ${montserrat_paragraph.variable} font-montserratParagraph border-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dashboard-button)`}
                        />
                      }
                    >
                      <span className="block sm:hidden">Add to Groups</span>
                      <span className="hidden sm:block">
                        Add Document to Groups
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      All selected documents will be added to the group
                    </TooltipContent>
                  </Tooltip>

                  {showMultiSelect && (
                    <div
                      ref={multiSelectRef}
                      className="absolute top-full right-0 z-10 mt-1 w-[250px]"
                    >
                      <DocGroupMultiSelect
                        data={documentGroupOptions}
                        aria-label="Filter by document group"
                        value={selectedDocGroups}
                        placeholder={
                          isLoadingDocumentGroups
                            ? 'Loading...'
                            : 'Select Group'
                        }
                        disabled={isLoadingDocumentGroups}
                        onChange={async (newSelectedGroupsFromDropdown) => {
                          const currentDocumentsQueryKey = [
                            'documents',
                            course_name,
                            page,
                            filterKey,
                            filterValue,
                            sortStatus.columnAccessor,
                            sortStatus.direction,
                          ]
                          const documentGroupsQueryKey = [
                            'documentGroups',
                            course_name,
                          ]

                          await queryClient.cancelQueries({
                            queryKey: currentDocumentsQueryKey,
                          })
                          await queryClient.cancelQueries({
                            queryKey: documentGroupsQueryKey,
                          })

                          const previousDocuments = queryClient.getQueryData(
                            currentDocumentsQueryKey,
                          )
                          const previousDocGroups = queryClient.getQueryData(
                            documentGroupsQueryKey,
                          )

                          queryClient.setQueryData(
                            currentDocumentsQueryKey,
                            (oldData: any) => {
                              if (!oldData || !oldData.final_docs)
                                return oldData
                              return {
                                ...oldData,
                                final_docs: oldData.final_docs.map(
                                  (doc: CourseDocument) => {
                                    if (
                                      selectedRecords.some((sr) =>
                                        isSameRecord(sr, doc),
                                      )
                                    ) {
                                      let updatedDocGroups = [
                                        ...(doc.doc_groups || []),
                                      ]

                                      newSelectedGroupsFromDropdown.forEach(
                                        (groupToAdd) => {
                                          if (
                                            !updatedDocGroups.includes(
                                              groupToAdd,
                                            )
                                          ) {
                                            updatedDocGroups.push(groupToAdd)
                                          }
                                        },
                                      )

                                      const commonGroupsDeselected =
                                        selectedDocGroups.filter(
                                          (commonGroup) =>
                                            !newSelectedGroupsFromDropdown.includes(
                                              commonGroup,
                                            ),
                                        )
                                      updatedDocGroups =
                                        updatedDocGroups.filter(
                                          (group) =>
                                            !commonGroupsDeselected.includes(
                                              group,
                                            ),
                                        )

                                      return {
                                        ...doc,
                                        doc_groups: updatedDocGroups.sort(),
                                      }
                                    }
                                    return doc
                                  },
                                ),
                              }
                            },
                          )

                          queryClient.setQueryData(
                            documentGroupsQueryKey,
                            (oldGroups: DocumentGroup[] = []) => {
                              const newGroupsData = JSON.parse(
                                JSON.stringify(oldGroups),
                              )
                              newSelectedGroupsFromDropdown.forEach(
                                (groupName) => {
                                  if (
                                    !newGroupsData.some(
                                      (g: DocumentGroup) =>
                                        g.name === groupName,
                                    )
                                  ) {
                                    newGroupsData.push({
                                      name: groupName,
                                      doc_count: 0,
                                      id: Date.now(),
                                      enabled: true,
                                    })
                                  }
                                },
                              )
                              return newGroupsData
                            },
                          )

                          try {
                            await addDocumentsToDocGroups(
                              selectedRecords,
                              newSelectedGroupsFromDropdown,
                            )

                            const unselectedCommonGroups: string[] =
                              selectedDocGroups.filter(
                                (group) =>
                                  !newSelectedGroupsFromDropdown.includes(
                                    group,
                                  ),
                              )

                            for (const record of selectedRecords) {
                              for (const unselectedGroup of unselectedCommonGroups) {
                                await removeFromDocGroup.mutate({
                                  record,
                                  removedGroup: unselectedGroup,
                                })
                              }
                            }
                          } catch (error) {
                            console.error(
                              'Error updating document groups:',
                              error,
                            )
                            if (previousDocuments)
                              queryClient.setQueryData(
                                currentDocumentsQueryKey,
                                previousDocuments,
                              )
                            if (previousDocGroups)
                              queryClient.setQueryData(
                                documentGroupsQueryKey,
                                previousDocGroups,
                              )
                          } finally {
                            queryClient.invalidateQueries({
                              queryKey: currentDocumentsQueryKey,
                            })
                            queryClient.invalidateQueries({
                              queryKey: documentGroupsQueryKey,
                            })

                            setSelectedDocGroups(newSelectedGroupsFromDropdown)
                            setShowMultiSelect(false)
                            setSelectedRecords([])
                          }
                        }}
                      />
                    </div>
                  )}
                  {showDeleteButton && (
                    <Button
                      type="button"
                      disabled={!selectedCount}
                      onClick={() => {
                        if (selectedCount > 100) {
                          showToast({
                            title: 'Selection Limit Exceeded',
                            message:
                              'You have selected more than 100 documents. Please select less than or equal to 100 documents.',
                            type: 'error',
                            autoClose: 12000,
                          })
                        } else {
                          setRecordsToDelete(selectedRecords)
                          setModalOpened(true)
                        }
                      }}
                      className={`mb-2 w-full border-0 px-4 py-2 text-xs uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dashboard-button) sm:mb-0 sm:w-auto sm:px-6 sm:py-3 ${
                        selectedCount
                          ? 'bg-red-900 hover:bg-red-800'
                          : 'bg-transparent'
                      } transition-colors duration-300 ${
                        montserrat_paragraph.variable
                      } font-montserratParagraph`}
                    >
                      <IconTrash size={16} aria-hidden="true" />
                      <span className="block sm:hidden">
                        Delete {selectedCount}
                      </span>
                      <span className="hidden sm:block">
                        {selectedCount
                          ? `Delete ${
                              selectedCount === 1
                                ? '1 selected record'
                                : `${selectedCount} selected records`
                            }`
                          : 'Select records to delete'}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="project_files_table mt-2 flex h-[90%] flex-1 flex-col overflow-hidden pb-4">
        <div className="flex-1 overflow-auto rounded-md border border-(--table-border)">
          <Table aria-label="Project documents" className={TABLE_GRID_CLASSES}>
            <TableHeader className="sticky top-0 z-10 bg-(--table-header-background)">
              <TableRow>
                {tabValue !== 'failed' && (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all documents on this page"
                      checked={allSelectableChecked}
                      indeterminate={someSelected}
                      onCheckedChange={(checked) =>
                        handleSelectedRecordsChange(checked ? records : [])
                      }
                    />
                  </TableHead>
                )}
                <TableHead style={{ width: fileNameWidth }}>
                  <div className="flex items-center justify-between gap-2">
                    <SortableColumnHeader
                      label="File Name"
                      accessor="readable_filename"
                      sortStatus={sortStatus}
                      onSortStatusChange={setSortStatus}
                    />
                    <FilterPopover
                      label="File Name"
                      placeholder="Search files..."
                      columnKey="readable_filename"
                      filterKey={filterKey}
                      filterValue={filterValue}
                      onFilterChange={handleFilterChange}
                    />
                  </div>
                </TableHead>
                <TableHead style={{ width: urlWidth }}>
                  <div className="flex items-center justify-between gap-2">
                    <SortableColumnHeader
                      label="URL"
                      accessor="url"
                      sortStatus={sortStatus}
                      onSortStatusChange={setSortStatus}
                    />
                    <FilterPopover
                      label="URL"
                      placeholder="Search urls..."
                      columnKey="url"
                      filterKey={filterKey}
                      filterValue={filterValue}
                      onFilterChange={handleFilterChange}
                    />
                  </div>
                </TableHead>
                <TableHead style={{ width: startingUrlWidth }}>
                  <div className="flex items-center justify-between gap-2">
                    <SortableColumnHeader
                      label="The Starting URL of Web Scraping"
                      accessor="base_url"
                      sortStatus={sortStatus}
                      onSortStatusChange={setSortStatus}
                    />
                    <FilterPopover
                      label="The Starting URL of Web Scraping"
                      placeholder="Search urls..."
                      columnKey="base_url"
                      filterKey={filterKey}
                      filterValue={filterValue}
                      onFilterChange={handleFilterChange}
                    />
                  </div>
                </TableHead>
                <TableHead
                  style={{
                    width: isBetweenSmallAndMediumScreen
                      ? 80
                      : isSmallScreen
                        ? 60
                        : 130,
                  }}
                >
                  <SortableColumnHeader
                    label="Date created"
                    accessor="created_at"
                    sortStatus={sortStatus}
                    onSortStatusChange={setSortStatus}
                  />
                </TableHead>
                {tabValue === 'failed' ? (
                  <TableHead style={{ width: 200 }}>Error</TableHead>
                ) : (
                  <>
                    <TableHead>Document Groups</TableHead>
                    <TableHead style={{ width: 75 }}>Actions</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={tabValue === 'failed' ? 5 : 7}
                    className="h-32 text-center"
                  >
                    <LoadingSpinner />
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={tabValue === 'failed' ? 5 : 7}
                    className="h-32 text-center text-(--foreground-faded)"
                  >
                    No records
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record, index) => {
                  const isSelected = selectedRecords.some((selected) =>
                    isSameRecord(selected, record),
                  )
                  return (
                    <TableRow
                      key={record.id ?? record.s3_path ?? record.url ?? index}
                      className={
                        isSelected
                          ? 'bg-(--dashboard-table-selected)'
                          : index % 2 === 0
                            ? 'bg-(--background)'
                            : 'bg-(--background-faded)'
                      }
                    >
                      {tabValue !== 'failed' && (
                        <TableCell>
                          <Checkbox
                            aria-label={`Select document ${record.id ?? index + 1}`}
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              toggleRecordSelected(record, Boolean(checked))
                            }
                          />
                        </TableCell>
                      )}
                      <TableCell className="break-words whitespace-normal">
                        {record.readable_filename ?? ''}
                      </TableCell>
                      <TableCell
                        className="break-words whitespace-normal"
                        style={{ maxWidth: '14vw' }}
                      >
                        {record.url ?? ''}
                      </TableCell>
                      <TableCell className="break-words whitespace-normal">
                        {record.base_url ?? ''}
                      </TableCell>
                      <TableCell className="break-words whitespace-normal">
                        {record.created_at
                          ? new Date(record.created_at).toLocaleString()
                          : ''}
                      </TableCell>
                      {tabValue === 'failed' ? (
                        <TableCell>
                          {(() => {
                            if (!textRefs.current[index]) {
                              textRefs.current[index] = createRef()
                            }
                            return (
                              <div>
                                <div
                                  ref={textRefs.current[index]}
                                  className="line-clamp-3 max-w-full text-sm"
                                >
                                  {(record as any).error}
                                </div>
                                {overflowStates[index] && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openModel(true, (record as any).error)
                                    }
                                    className="w-full rounded-md text-right text-sm text-(--link) hover:underline"
                                  >
                                    Read more
                                  </button>
                                )}
                              </div>
                            )
                          })()}
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="whitespace-normal">
                            <DocGroupMultiSelect
                              data={documentGroupOptions}
                              aria-label="Assign document groups"
                              value={record.doc_groups ?? []}
                              placeholder={
                                isLoadingDocumentGroups
                                  ? 'Loading...'
                                  : 'Select Group'
                              }
                              disabled={isLoadingDocumentGroups}
                              onChange={(newSelectedGroups) => {
                                handleDocumentGroupsChange(
                                  record,
                                  newSelectedGroups,
                                )
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="View document"
                                className="text-green-600 hover:text-green-700"
                                onClick={async () => {
                                  let urlToOpen: string | null | undefined =
                                    record.url
                                  if (!record.url && record.s3_path) {
                                    urlToOpen = await fetchPresignedUrl(
                                      record.s3_path,
                                      course_name,
                                      undefined,
                                      record.readable_filename,
                                    )
                                  }
                                  if (urlToOpen) {
                                    window.open(urlToOpen, '_blank')
                                  }
                                }}
                              >
                                <IconEye size={16} aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Delete document"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setRecordsToDelete([record])
                                  setModalOpened(true)
                                }}
                              >
                                <IconTrash size={16} aria-hidden="true" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        <TablePaginationFooter
          page={page}
          totalRecords={totalRecords}
          recordsPerPage={PAGE_SIZE}
          onPageChange={setPage}
        />

        <Dialog open={modalOpened} onOpenChange={setModalOpened}>
          <DialogContent className="bg-(--modal) text-(--modal-text)">
            <DialogHeader>
              <DialogTitle className="text-(--modal-text)">
                Please confirm your action
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-(--modal-text)">
              Are you sure you want to delete the selected records?
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="bg-(--background-faded) text-(--foreground) hover:bg-(--dashboard-button-hover) hover:text-(--dashboard-button-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dashboard-button)"
                onClick={() => setModalOpened(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="dashboard"
                onClick={async () => {
                  setModalOpened(false)
                  setIsDeletingDocuments(true)
                  console.debug('Deleting records:', recordsToDelete)
                  deleteDocumentMutation.mutate(recordsToDelete)
                  setRecordsToDelete([])
                  setSelectedRecords([])
                  setSelectedCount(0)
                  setShowDeleteButton(false)
                  const sleep = (ms: number) =>
                    new Promise((resolve) => setTimeout(resolve, ms))
                  console.debug('sleeping for 1s before refetching')
                  await sleep(1000)
                  refetchDocuments()
                  setIsDeletingDocuments(false)
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={errorModalOpened} onOpenChange={setErrorModalOpened}>
          <DialogContent className="border-(--modal-border) bg-(--modal) text-(--modal-text) sm:max-w-xl">
            <DialogHeader className="border-b border-(--modal-border) pb-2">
              <DialogTitle className="text-(--modal-text)">
                Error Details
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center p-4">
              <pre
                className="w-full overflow-x-auto rounded-md bg-(--modal) p-0 text-sm text-(--modal-text)"
                style={{ whiteSpace: 'pre-wrap', lineHeight: '165%' }}
              >
                <div className="flex justify-end">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={copiedError ? 'Copied' : 'Copy'}
                          onClick={() => {
                            navigator.clipboard.writeText(currentError)
                            setCopiedError(true)
                            setTimeout(() => setCopiedError(false), 2000)
                          }}
                        />
                      }
                    >
                      {copiedError ? (
                        <IconCheck
                          size={16}
                          aria-hidden="true"
                          className="text-(--foreground)"
                        />
                      ) : (
                        <IconCopy
                          size={16}
                          aria-hidden="true"
                          className="text-(--foreground-faded)"
                        />
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {copiedError ? 'Copied' : 'Copy'}
                    </TooltipContent>
                  </Tooltip>
                </div>
                {currentError}
              </pre>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={exportModalOpened} onOpenChange={setExportModalOpened}>
          <DialogContent className="bg-(--modal) text-(--modal-text)">
            <DialogHeader>
              <DialogTitle className="text-(--modal-text)">
                Please confirm your action
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-(--modal-text)">
              Are you sure you want to export all the documents and embeddings?
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="bg-transparent text-(--dashboard-button-foreground) hover:bg-(--dashboard-button-hover)"
                onClick={() => setExportModalOpened(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="dashboard"
                onClick={async () => {
                  setExportModalOpened(false)
                  const result = await handleExport(getCurrentPageName())
                  if (result && result.message) {
                    showToastOnUpdate(false, false, result.message)
                  }
                }}
              >
                Export
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function ErrorStateForProjectFilesTable() {
  return (
    <div className="flex h-[80vh] w-full flex-col rounded-lg border border-(--table-border)">
      <Table aria-label="Project documents" className={TABLE_GRID_CLASSES}>
        <TableHeader className="bg-(--table-header-background)">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>The Starting URL of Web Scraping</TableHead>
            <TableHead>Document Groups</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-center text-base text-(--foreground-faded)">
          Ah! We hit a wall when fetching your documents. The database must be
          on fire 🔥
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary
            external host not in the next/image remotePatterns allowlist */}
        <img
          src="https://assets.kastan.ai/this-is-fine.jpg"
          alt="No data found"
          className="max-w-[30vw] min-w-[300px] rounded-lg"
        />
        <p className="text-center text-base text-(--foreground-faded)">
          So.. please try again later.
        </p>
      </div>
    </div>
  )
}
