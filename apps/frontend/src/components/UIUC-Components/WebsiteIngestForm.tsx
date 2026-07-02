import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  Text,
  Card,
  Tooltip,
  Button,
  Autocomplete,
  type AutocompleteItem,
  ActionIcon,
  TextInput,
  List,
  SegmentedControl,
  Center,
  rem,
} from '@mantine/core'
import { formatDistanceToNow } from 'date-fns'
import { useFetchScrapeRuns } from '~/hooks/queries/useFetchScrapeRuns'
import { type ScrapeRun } from '~/pages/api/scrapeRuns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../Dialog'
import {
  IconAlertCircle,
  IconHome,
  IconSitemap,
  IconSubtask,
  IconWorld,
  IconWorldDownload,
  IconArrowRight,
  IconInfoCircle,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react'
// import { APIKeyInput } from '../LLMsApiKeyInputForm'
// import { ModelToggles } from '../ModelToggles'
import { AnimatePresence, motion } from 'framer-motion'
// import { Checkbox } from '@radix-ui/react-checkbox'
import { montserrat_heading } from 'fonts'
import { notifications } from '@mantine/notifications'
import axios from 'axios'
import { Montserrat } from 'next/font/google'
import { type FileUpload } from './UploadNotification'
import { type QueryClient } from '@tanstack/react-query'

const montserrat_med = Montserrat({
  weight: '500',
  subsets: ['latin'],
})

// Human-readable labels for the scrape strategy values used by SegmentedControl.
const SCRAPE_STRATEGY_LABELS: Record<string, string> = {
  'equal-and-below': 'Equal and Below',
  'same-hostname': 'Subdomain',
  'same-domain': 'Entire domain',
  all: 'All',
}

const strategyLabel = (strategy: string | null | undefined) =>
  (strategy && SCRAPE_STRATEGY_LABELS[strategy]) ||
  strategy ||
  'Equal and Below'

// Secondary line for a suggestion: "Equal and Below · 50 urls · 3 days ago"
const scrapeRunSummary = (run: ScrapeRun) => {
  const when = run.last_run_at
    ? formatDistanceToNow(new Date(run.last_run_at), { addSuffix: true })
    : ''
  return [
    strategyLabel(run.scrape_strategy),
    `${run.max_urls ?? 50} urls`,
    when,
  ]
    .filter(Boolean)
    .join(' · ')
}

// Each Autocomplete suggestion carries the underlying run so onItemSubmit can
// apply its exact params. `value` is unique (url + id) to keep React keys clean
// when the same URL has several param sets; the input is corrected back to the
// bare URL on select (see handleSuggestionSubmit).
interface ScrapeRunAutocompleteItem extends AutocompleteItem {
  url: string
  summary: string
  run: ScrapeRun
  highlightCurrent?: boolean
  onBrowseItemMouseEnter?: () => void
}

const ScrapeRunAutocompleteOption = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    url: string
    summary: string
    run: ScrapeRun
    highlightCurrent?: boolean
    onBrowseItemMouseEnter?: () => void
  }
>(
  (
    {
      url,
      summary,
      run,
      highlightCurrent,
      onBrowseItemMouseEnter,
      value: _value,
      onMouseEnter: mantineOnMouseEnter,
      ...others
    }: any,
    ref,
  ) => {
    const mantineHovered = others['data-hovered']

    return (
      <div
        ref={ref}
        {...others}
        onMouseEnter={(e) => {
          mantineOnMouseEnter?.(e)
          onBrowseItemMouseEnter?.()
        }}
        data-hovered={(mantineHovered || highlightCurrent) || undefined}
        style={{
          ...others.style,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          ...(highlightCurrent && !mantineHovered
            ? {
                color: 'var(--foreground)',
                backgroundColor: 'var(--foreground-faded)',
              }
            : {}),
        }}
      >
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" truncate>
          {url}
        </Text>
        <Text size="xs" opacity={0.6} truncate>
          {summary}
        </Text>
      </div>
    </div>
    )
  },
)
ScrapeRunAutocompleteOption.displayName = 'ScrapeRunAutocompleteOption'

export default function WebsiteIngestForm({
  project_name,
  setUploadFiles,
  queryClient,
}: {
  project_name: string
  setUploadFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>
  queryClient: QueryClient
}): JSX.Element {
  const [isUrlUpdated, setIsUrlUpdated] = useState(false)
  const [isUrlValid, setIsUrlValid] = useState(false)
  const [url, setUrl] = useState('')
  const [maxUrls, setMaxUrls] = useState('50')
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    variable: string,
  ) => {
    const value = e.target.value
    if (variable === 'maxUrls') {
      setMaxUrls(value)

      if (value && /^\d+$/.test(value)) {
        const numValue = parseInt(value)
        if (numValue >= 1 && numValue <= 500) {
          setInputErrors((prev) => ({
            ...prev,
            maxUrls: { error: false, message: '' },
          }))
          return
        }
      }

      let errorMessage = ''
      if (!value) {
        errorMessage = 'Please provide an input for Max URLs'
      } else if (!/^\d+$/.test(value)) {
        errorMessage = 'Max URLs should be a valid number'
      } else {
        const numValue = parseInt(value)
        if (numValue < 1 || numValue > 500) {
          errorMessage = 'Max URLs should be between 1 and 500'
        }
      }

      setInputErrors((prev) => ({
        ...prev,
        maxUrls: {
          error: !!errorMessage,
          message: errorMessage,
        },
      }))
    }
  }
  const icon = <IconWorldDownload size={'50%'} aria-hidden="true" />
  const [scrapeStrategy, setScrapeStrategy] =
    useState<string>('equal-and-below')
  const [open, setOpen] = useState(false)
  // Toggles the per-method explanations under "Limit web crawl" (info icon).
  const [crawlInfoOpened, setCrawlInfoOpened] = useState(false)

  const urlInputRef = useRef<HTMLInputElement>(null)
  const [urlDropdownOpened, setUrlDropdownOpened] = useState(false)
  // When true, the URL dropdown lists every saved scrape (not filtered by the
  // current input). Typing switches back to search mode.
  const [urlBrowseAll, setUrlBrowseAll] = useState(false)
  // Clears the default "current selection" highlight once the user hovers any item.
  const [urlBrowseHighlightSuppressed, setUrlBrowseHighlightSuppressed] =
    useState(false)

  const enterUrlBrowseMode = () => {
    setUrlBrowseAll(true)
    setUrlBrowseHighlightSuppressed(false)
  }

  // Previous scrape parameter sets for this project (most-recently-used first).
  const { data: scrapeRuns } = useFetchScrapeRuns({ courseName: project_name })

  // One suggestion per distinct param set; `value` unique to avoid key clashes.
  const scrapeRunSuggestions: ScrapeRunAutocompleteItem[] = useMemo(
    () =>
      (scrapeRuns ?? []).map((run) => ({
        value: `${run.url} ${run.id}`,
        url: run.url,
        summary: scrapeRunSummary(run),
        run,
      })),
    [scrapeRuns],
  )

  const hasScrapeHistory = scrapeRunSuggestions.length > 0

  const highlightedScrapeRunId = useMemo(() => {
    if (!urlBrowseAll) return null
    const match = (scrapeRuns ?? []).find(
      (run) =>
        run.url === url &&
        String(run.max_urls ?? 50) === maxUrls &&
        (run.scrape_strategy ?? 'equal-and-below') === scrapeStrategy,
    )
    return match?.id ?? null
  }, [urlBrowseAll, scrapeRuns, url, maxUrls, scrapeStrategy])

  const scrapeRunAutocompleteData: ScrapeRunAutocompleteItem[] = useMemo(
    () =>
      scrapeRunSuggestions.map((item) => ({
        ...item,
        highlightCurrent:
          urlBrowseAll &&
          !urlBrowseHighlightSuppressed &&
          item.run.id === highlightedScrapeRunId,
        onBrowseItemMouseEnter: () => setUrlBrowseHighlightSuppressed(true),
      })),
    [
      scrapeRunSuggestions,
      urlBrowseAll,
      urlBrowseHighlightSuppressed,
      highlightedScrapeRunId,
    ],
  )

  const openUrlBrowseDropdown = () => {
    if (!hasScrapeHistory) return
    enterUrlBrowseMode()
    urlInputRef.current?.focus()
    urlInputRef.current?.click()
  }

  useEffect(() => {
    if (!urlBrowseAll || !urlDropdownOpened || !highlightedScrapeRunId) return
    const index = scrapeRunAutocompleteData.findIndex(
      (item) => item.run.id === highlightedScrapeRunId,
    )
    if (index < 0) return
    const inputId = urlInputRef.current?.id
    if (!inputId) return
    requestAnimationFrame(() => {
      document
        .getElementById(`${inputId}-${index}`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }, [
    urlBrowseAll,
    urlDropdownOpened,
    highlightedScrapeRunId,
    scrapeRunAutocompleteData,
  ])

  const setUrlValue = (input: string) => {
    setUrl(input)
    setIsUrlValid(validateUrl(input))
  }

  // Picking a suggestion auto-applies its params and resets the input to the
  // bare URL (overriding the unique `value` Mantine just committed). Both
  // setState calls batch within this handler, so the composite never renders.
  const handleSuggestionSubmit = (item: AutocompleteItem) => {
    const run = (item as ScrapeRunAutocompleteItem).run
    if (!run) return
    setUrlValue(run.url)
    setMaxUrls(String(run.max_urls ?? 50))
    setScrapeStrategy(run.scrape_strategy ?? 'equal-and-below')
    setInputErrors((prev) => ({
      ...prev,
      maxUrls: { error: false, message: '' },
    }))
  }

  const validateUrl = (input: string) => {
    const regex = /^(https?:\/\/)?.+/
    return regex.test(input)
  }

  const [inputErrors, setInputErrors] = useState({
    maxUrls: { error: false, message: '' },
    maxDepth: { error: false, message: '' },
  })

  const handleIngest = async () => {
    const ingestUrl = url
    const ingestMaxUrls = maxUrls
    const ingestStrategy = scrapeStrategy
    const maxUrlsHasError = inputErrors.maxUrls.error
    const urlIsValid = isUrlValid

    setOpen(false)

    if (maxUrlsHasError) {
      alert('Invalid max URLs input (1 to 500)')
      return
    }

    if (urlIsValid) {
      const newFile: FileUpload = {
        name: ingestUrl,
        status: 'uploading',
        type: 'webscrape',
        url: ingestUrl,
        isBaseUrl: true,
      }
      setUploadFiles((prevFiles) => [...prevFiles, newFile])

      try {
        const response = await scrapeWeb(
          ingestUrl,
          project_name,
          maxUrls.trim() !== '' ? parseInt(maxUrls) : 50,
          scrapeStrategy,
        )
        // Refresh the URL autocomplete suggestions with this run's params.
        await queryClient.invalidateQueries({
          queryKey: ['scrapeRuns', project_name],
        })
        // Transition to 'ingesting' status after API call succeeds
        setUploadFiles((prevFiles) =>
          prevFiles.map((file) =>
            file.name === url ? { ...file, status: 'ingesting' } : file,
          ),
        )
        // Transition to 'ingesting' status after API call succeeds
        setUploadFiles((prevFiles) =>
          prevFiles.map((file) =>
            file.name === url ? { ...file, status: 'ingesting' } : file,
          ),
        )
      } catch (error: unknown) {
        console.error('Error while scraping web:', error)
        setUploadFiles((prevFiles) =>
          prevFiles.map((file) =>
            file.name === ingestUrl ? { ...file, status: 'error' } : file,
          ),
        )
        // Remove the timeout since we're handling errors properly now
      }
    } else {
      alert('Invalid URL (please include https://)')
    }

    await new Promise((resolve) => setTimeout(resolve, 8000))
  }

  useEffect(() => {
    if (url && url.length > 0 && validateUrl(url)) {
      setIsUrlUpdated(true)
    } else {
      setIsUrlUpdated(false)
    }
  }, [url])

  useEffect(() => {
    const checkIngestStatus = async () => {
      const response = await fetch(
        `/api/materialsTable/docsInProgress?course_name=${project_name}`,
      )
      const data = await response.json()
      const docsResponse = await fetch(
        `/api/materialsTable/successDocs?course_name=${project_name}`,
      )
      const docsData = await docsResponse.json()
      // Helper function to organize docs by base URL
      const organizeDocsByBaseUrl = (
        docs: Array<{ base_url: string; url: string }>,
      ) => {
        const baseUrlMap = new Map<string, Set<string>>()

        docs.forEach((doc) => {
          if (!baseUrlMap.has(doc.base_url)) {
            baseUrlMap.set(doc.base_url, new Set())
          }
          baseUrlMap.get(doc.base_url)?.add(doc.url)
        })

        return baseUrlMap
      }

      // Helper function to update status of existing files
      const updateExistingFiles = (
        currentFiles: FileUpload[],
        docsInProgress: Array<{ base_url: string }>,
      ) => {
        return currentFiles.map((file) => {
          if (file.type !== 'webscrape') return file
          const fileUrl = file.url ?? ''

          const isStillIngesting = docsInProgress.some(
            (doc) =>
              doc.base_url === file.name ||
              (file.isBaseUrl && doc.base_url === file.url),
          )

          if (file.status === 'uploading' && isStillIngesting) {
            return { ...file, status: 'ingesting' as const }
          } else if (file.status === 'ingesting') {
            if (!isStillIngesting) {
              // Check if any child URLs are still in progress
              const childFiles = currentFiles.filter(
                (f) => f.url && f.url !== fileUrl && f.url.startsWith(fileUrl),
              )
              const allChildrenDone =
                childFiles.length === 0 ||
                childFiles.every(
                  (f) => f.status === 'complete' || f.status === 'error',
                )

              const isInCompletedDocs = docsData?.documents?.some(
                (doc: { url: string; base_url?: string }) =>
                  doc.url === file.url ||
                  (file.isBaseUrl && doc.base_url === file.url),
              )

              if (file.isBaseUrl && allChildrenDone && isInCompletedDocs) {
                // Base URL can only complete if all children done
                return { ...file, status: 'complete' as const }
              } else if (!file.isBaseUrl && isInCompletedDocs) {
                return { ...file, status: 'complete' as const }
              }

              // If not in completed docs, keep as 'ingesting'
              // The crawling might still be in progress even if not in docsInProgress
              return file
            }
          }
          return file
        })
      }

      // Helper function to create new file entries for additional URLs
      const createAdditionalFileEntries = (
        baseUrlMap: Map<string, Set<string>>,
        currentFiles: FileUpload[],
        docsInProgress: Array<{ base_url: string; readable_filename: string }>,
      ) => {
        const newFiles: FileUpload[] = []

        baseUrlMap.forEach((urls, baseUrl) => {
          // Only process if we have this base URL in our current files
          if (currentFiles.some((file) => file.name === baseUrl)) {
            const matchingDoc = docsInProgress.find(
              (doc) => doc.base_url === baseUrl,
            )

            const isStillIngesting = matchingDoc !== undefined

            urls.forEach((url) => {
              if (
                !currentFiles.some((file) => file.url === url) &&
                matchingDoc
              ) {
                newFiles.push({
                  name: url,
                  status: isStillIngesting ? 'ingesting' : 'complete',
                  type: 'webscrape',
                  url: url,
                })
              }
            })
          }
        })

        return newFiles
      }

      setUploadFiles((prev) => {
        const matchingDocsInProgress =
          data?.documents?.filter((doc: { base_url: string }) =>
            prev.some((file) => file.name === doc.base_url),
          ) || []

        const baseUrlMap = organizeDocsByBaseUrl(matchingDocsInProgress)

        const additionalFiles = createAdditionalFileEntries(
          baseUrlMap,
          prev,
          matchingDocsInProgress,
        )

        const updatedFiles = updateExistingFiles(prev, matchingDocsInProgress)

        return [...updatedFiles, ...additionalFiles]
      })

      await queryClient.invalidateQueries({
        queryKey: ['documents', project_name],
      })
    }

    const interval = setInterval(checkIngestStatus, 3000)
    return () => {
      clearInterval(interval)
    }
  }, [project_name])

  const scrapeWeb = async (
    url: string | null,
    courseName: string | null,
    maxUrls: number,
    scrapeStrategy: string,
  ) => {
    try {
      if (!url || !courseName) return null
      console.log('SCRAPING', url)

      const response = await axios.post('/api/scrapeWeb', {
        url,
        courseName,
        maxUrls,
        scrapeStrategy,
      })

      console.log(
        'Response from Next.js API web scraping endpoint:',
        response.data,
      )
      return response.data
    } catch (error: any) {
      console.error('Error during web scraping:', error)

      notifications.show({
        id: 'error-notification',
        withCloseButton: true,
        closeButtonProps: { color: 'red' },
        onClose: () => console.log('error unmounted'),
        onOpen: () => console.log('error mounted'),
        autoClose: 12000,
        title: (
          <Text size={'lg'} className={`${montserrat_med.className}`}>
            {'Error during web scraping. Please try again.'}
          </Text>
        ),
        message: (
          <Text className={`${montserrat_med.className} text-neutral-200`}>
            {error.message}
          </Text>
        ),
        color: 'red',
        radius: 'lg',
        icon: <IconAlertCircle aria-hidden="true" />,
        className: 'my-notification-class',
        style: {
          backgroundColor: 'rgba(42,42,64,0.3)',
          backdropFilter: 'blur(10px)',
          borderLeft: '5px solid red',
        },
        withBorder: true,
        loading: false,
      })
      throw error // Re-throw so handleIngest can update file status to 'error'
    }
  }

  return (
    <motion.div layout>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) {
            setUrl('')
            setIsUrlValid(false)
            setIsUrlUpdated(false)
            setMaxUrls('50')
            setUrlDropdownOpened(false)
            setUrlBrowseAll(false)
            setUrlBrowseHighlightSuppressed(false)
            setInputErrors((prev) => ({
              ...prev,
              maxUrls: { error: false, message: '' },
            }))
          }
        }}
      >
        <DialogTrigger
          asChild
          tabIndex={0}
          className="focus:bg-[--dashboard-background-dark]"
        >
          <Card
            role="button"
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                ;(e.currentTarget as HTMLElement).click()
              }
            }}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[--dashboard-border] bg-transparent px-6 py-4 text-[--dashboard-foreground] transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
            style={{ height: '100%' }}
          >
            <div className="-ml-2 mb-2 flex items-center justify-between">
              <div className="flex items-center space-x-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-full">
                  <IconWorldDownload className="h-8 w-8" aria-hidden="true" />
                </div>
                <Text className="text-xl font-semibold text-[--dashboard-foreground]">
                  Website
                </Text>
              </div>
            </div>

            <Text className="mb-4 text-sm leading-relaxed text-[--dashboard-foreground-faded]">
              Import content from any website by providing the URL. Supports
              recursive crawling with customizable depth.
            </Text>

            <div className="mt-auto flex items-center text-sm font-bold text-[--dashboard-button]">
              <span>Configure import</span>
              <IconArrowRight
                size={16}
                aria-hidden="true"
                className="ml-2 transition-transform group-hover:translate-x-1"
              />
            </div>
          </Card>
        </DialogTrigger>

        <DialogContent className="mx-auto h-auto max-h-[85vh] w-[95%] max-w-2xl overflow-y-auto !rounded-2xl border-0 bg-[--modal] px-4 py-6 text-[--modal-text] sm:px-6">
          <DialogHeader>
            <DialogTitle className="mb-2 text-left text-xl font-bold">
              Ingest Website
            </DialogTitle>
          </DialogHeader>
          <div className="">
            <div className="max-h-[70vh] overflow-y-auto sm:h-auto sm:max-h-none sm:overflow-visible">
              <div className="space-y-4">
                <form
                  className="w-full"
                  onSubmit={(event) => {
                    event.preventDefault()
                  }}
                >
                  <Autocomplete
                    ref={urlInputRef}
                    icon={icon}
                    rightSection={
                      hasScrapeHistory ? (
                        <button
                          type="button"
                          aria-label={
                            urlDropdownOpened
                              ? 'Hide saved scrapes'
                              : 'Show saved scrapes'
                          }
                          aria-expanded={urlDropdownOpened}
                          tabIndex={-1}
                          className="flex h-full items-center justify-center border-0 bg-transparent p-0 text-[--foreground] hover:text-[--illinois-orange]"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            if (urlDropdownOpened) {
                              urlInputRef.current?.blur()
                            } else {
                              openUrlBrowseDropdown()
                            }
                          }}
                        >
                          {urlDropdownOpened ? (
                            <IconChevronUp
                              size={18}
                              stroke={2}
                              aria-hidden="true"
                            />
                          ) : (
                            <IconChevronDown
                              size={18}
                              stroke={2}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      ) : null
                    }
                    rightSectionWidth={hasScrapeHistory ? rem(40) : undefined}
                    onDropdownOpen={() => setUrlDropdownOpened(true)}
                    onDropdownClose={() => {
                      setUrlDropdownOpened(false)
                      setUrlBrowseAll(false)
                      setUrlBrowseHighlightSuppressed(false)
                    }}
                    onFocus={() => {
                      if (hasScrapeHistory) enterUrlBrowseMode()
                    }}
                    onClick={() => {
                      if (hasScrapeHistory) enterUrlBrowseMode()
                    }}
                    aria-label="Website URL"
                    className="w-full rounded-full"
                    data={scrapeRunAutocompleteData}
                    itemComponent={ScrapeRunAutocompleteOption}
                    onItemSubmit={handleSuggestionSubmit}
                    limit={50}
                    maxDropdownHeight={280}
                    // Suggest by URL match (and the summary), not the unique value.
                    filter={(query, item) => {
                      const it = item as ScrapeRunAutocompleteItem
                      if (urlBrowseAll) return true
                      const q = query.toLowerCase().trim()
                      return (
                        it.url.toLowerCase().includes(q) ||
                        it.summary.toLowerCase().includes(q)
                      )
                    }}
                    nothingFound={null}
                    // Dropdown colors + hover match the default-model Select on
                    // the LLMs admin page (see api-inputs/LLMsApiKeyInputForm.tsx).
                    styles={(theme) => ({
                      input: {
                        color: 'var(--foreground)',
                        backgroundColor: 'var(--background-faded)',
                        borderColor: 'var(--background-dark)',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        '&:focus': {
                          borderColor: 'var(--illinois-orange)',
                        },
                      },
                      wrapper: {
                        width: '100%',
                      },
                      rightSection: {
                        pointerEvents: 'auto',
                        color: 'var(--foreground)',
                      },
                      dropdown: {
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--background-dark)',
                        borderRadius: theme.radius.md,
                        marginTop: '2px',
                        boxShadow: theme.shadows.xs,
                      },
                      item: {
                        color: 'var(--foreground)',
                        backgroundColor: 'var(--background)',
                        borderRadius: theme.radius.md,
                        margin: '2px',
                        overflow: 'hidden',
                        '&[data-hovered]': {
                          color: 'var(--foreground)',
                          backgroundColor: 'var(--foreground-faded)',
                        },
                        '&[data-selected]': {
                          '&': {
                            color: 'var(--foreground)',
                            backgroundColor: 'transparent',
                          },
                          '&:hover': {
                            color: 'var(--foreground)',
                            backgroundColor: 'var(--foreground-faded)',
                          },
                        },
                      },
                    })}
                    placeholder="Enter URL..."
                    radius="md"
                    value={url}
                    size="lg"
                    onChange={(value) => {
                      setUrlBrowseAll(false)
                      setUrlValue(value)
                    }}
                  />
                  <div className="pb-2 pt-2">
                    <Tooltip
                      multiline
                      w={400}
                      color="var(--tooltip-background)"
                      arrowPosition="side"
                      arrowSize={8}
                      withArrow
                      position="bottom-start"
                      label="We will attempt to visit this number of pages, but not all will be scraped if they're duplicates, broken or otherwise inaccessible."
                      styles={{
                        tooltip: {
                          color: 'var(--tooltip)',
                          backgroundColor: 'var(--tooltip-background)',
                        },
                      }}
                    >
                      <div className="mt-4">
                        <Text
                          style={{ fontSize: '16px' }}
                          className={`${montserrat_heading.variable} font-montserratHeading`}
                        >
                          Max URLs (1 to 500)
                        </Text>

                        <TextInput
                          name="maximumUrls"
                          aria-label="Max URLs (1 to 500)"
                          radius="md"
                          placeholder="Default 50"
                          value={maxUrls}
                          onChange={(e) => {
                            handleInputChange(e, 'maxUrls')
                          }}
                          error={inputErrors.maxUrls.error}
                          className="mt-2 w-full rounded-full"
                          styles={{
                            input: {
                              color: 'var(--foreground)',
                              backgroundColor:
                                'var(--background-faded) !important',
                              borderColor: 'var(--background-dark)',
                              padding:
                                'calc(var(--padding) * 1.5) calc(var(--padding) * .75)',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              '&:focus': {
                                borderColor: 'var(--illinois-orange)',
                              },
                            },
                            wrapper: {
                              width: '100%',
                            },
                          }}
                        />
                      </div>
                    </Tooltip>
                  </div>
                  {inputErrors.maxUrls.error && (
                    <p style={{ color: 'red' }}>
                      {inputErrors.maxUrls.message}
                    </p>
                  )}
                  {inputErrors.maxDepth.error && (
                    <p style={{ color: 'red' }}>
                      {inputErrors.maxDepth.message}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <Text
                      style={{ fontSize: '16px' }}
                      className={`${montserrat_heading.variable} font-montserratHeading`}
                    >
                      Limit web crawl
                    </Text>
                    <ActionIcon
                      variant="subtle"
                      color="var(--foreground-faded)"
                      onClick={() => setCrawlInfoOpened(!crawlInfoOpened)}
                      className="hover:bg-[--background]"
                      title="What does each crawl limit mean?"
                    >
                      <IconInfoCircle
                        className="text-[--foreground-faded] hover:text-[--foreground]"
                        aria-hidden="true"
                      />
                    </ActionIcon>
                  </div>
                  <AnimatePresence>
                    {crawlInfoOpened && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="mt-2 overflow-hidden"
                      >
                        <div className="flex bg-[--background-faded]">
                          <div className="w-1 bg-[--illinois-orange]" />
                          <div className="flex-1 p-4">
                            <List className="text-[--modal-text]">
                      <List.Item>
                        <strong>Equal and Below:</strong> Only scrape content
                        that starts will the given URL. E.g. nasa.gov/blogs will
                        scrape all blogs like nasa.gov/blogs/new-rocket but
                        never go to nasa.gov/events.
                      </List.Item>
                      <List.Item>
                        <strong>Same subdomain:</strong> Crawl the entire
                        subdomain. E.g. docs.nasa.gov will grab that entire
                        subdomain, but not nasa.gov or api.nasa.gov.
                      </List.Item>
                      <List.Item>
                        <strong>Entire domain:</strong> Crawl as much of this
                        entire website as possible. E.g. nasa.gov also includes
                        docs.nasa.gov
                      </List.Item>
                      <List.Item>
                        <span>
                          <strong>All:</strong> Start on the given URL and
                          wander the web...{' '}
                          <Text>
                            For more detail{' '}
                            <a
                              className={'font-bold text-[--link]'}
                              href="https://docs.uiuc.chat/features/web-crawling-details"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              read the docs
                            </a>
                            .
                          </Text>
                        </span>
                      </List.Item>
                            </List>
                            <Text className="mt-4 text-[--modal-text]">
                              <strong>
                                I suggest starting with Equal and Below
                              </strong>
                              , then just re-run this if you need more later.
                            </Text>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <SegmentedControl
                    fullWidth
                    orientation="vertical"
                    size="sm"
                    radius="none"
                    value={scrapeStrategy}
                    onChange={(strat) => setScrapeStrategy(strat)}
                    className="mt-4 bg-[--background-faded]"
                    styles={{
                      indicator: {
                        color: 'var(--dashboard-button-foreground)',
                        backgroundColor: 'var(--dashboard-button)',
                      },
                      label: {
                        color: 'var(--foreground)',

                        '&:hover': {
                          color: 'var(--dashboard-button)',
                        },
                      },
                    }}
                    data={[
                      {
                        value: 'equal-and-below',
                        label: (
                          <Center style={{ gap: 10 }}>
                            <IconSitemap
                              style={{ width: rem(16), height: rem(16) }}
                              aria-hidden="true"
                            />
                            <span>Equal and Below</span>
                          </Center>
                        ),
                      },
                      {
                        value: 'same-hostname',
                        label: (
                          <Center style={{ gap: 10 }}>
                            <IconSubtask
                              style={{ width: rem(16), height: rem(16) }}
                              aria-hidden="true"
                            />
                            <span>Subdomain</span>
                          </Center>
                        ),
                      },
                      {
                        value: 'same-domain',
                        label: (
                          <Center style={{ gap: 10 }}>
                            <IconHome
                              style={{ width: rem(16), height: rem(16) }}
                              aria-hidden="true"
                            />
                            <span>Entire domain</span>
                          </Center>
                        ),
                      },
                      {
                        value: 'all',
                        label: (
                          <Center style={{ gap: 10 }}>
                            <IconWorld
                              style={{ width: rem(16), height: rem(16) }}
                              aria-hidden="true"
                            />
                            <span>All</span>
                          </Center>
                        ),
                      },
                    ]}
                  />
                </form>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={handleIngest}
              disabled={!isUrlValid}
              className="h-11 w-full rounded-xl bg-[--dashboard-button] text-[--dashboard-button-foreground] transition-colors hover:bg-[--dashboard-button-hover] disabled:bg-[--background-faded] disabled:text-[--background-dark]"
            >
              Ingest the Website
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
