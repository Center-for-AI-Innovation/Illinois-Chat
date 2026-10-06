// Web Scrape
import { Button } from '@/components/shadcn/ui/button'
import { Input } from '@/components/shadcn/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import {
  IconHome,
  IconSitemap,
  IconSubtask,
  IconWorld,
  IconWorldDownload,
  IconHelp,
} from '@tabler/icons-react'
import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useRouter } from 'next/router'
import { callSetCourseMetadata } from '~/utils/apiUtils'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { LoadingSpinner } from './LoadingSpinner'
import { showToast } from '~/utils/toastUtils'

interface WebScrapeProps {
  is_new_course: boolean
  courseName: string
  isDisabled: boolean
  current_user_email: string
}

const validateUrl = (url: string) => {
  const courseraRegex = /^https?:\/\/(www\.)?coursera\.org\/learn\/.+/
  const mitRegex = /^https?:\/\/ocw\.mit\.edu\/.+/
  const githubRegex = /^https?:\/\/(www\.)?github\.com\/.+/
  const canvasRegex = /^https?:\/\/canvas\.illinois\.edu\/courses\/\d+/
  const webScrapingRegex = /^(https?:\/\/)?.+/

  return (
    courseraRegex.test(url) ||
    mitRegex.test(url) ||
    githubRegex.test(url) ||
    canvasRegex.test(url) ||
    webScrapingRegex.test(url)
  )
}

export const WebScrape = ({
  is_new_course,
  courseName,
  isDisabled,
  current_user_email,
}: WebScrapeProps) => {
  const [isUrlUpdated, setIsUrlUpdated] = useState(false)
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState(
    <IconWorldDownload size={24} aria-hidden="true" />,
  )
  const [loadingSpinner, setLoadingSpinner] = useState(false)
  const router = useRouter()
  const [maxUrls, setMaxUrls] = useState('50')
  const [scrapeStrategy, setScrapeStrategy] =
    useState<string>('equal-and-below')
  const [selectedCanvasOptions, setSelectedCanvasOptions] = useState<string[]>([
    'files',
    'pages',
    'modules',
    'syllabus',
    'assignments',
    'discussions',
  ])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    variable: string,
  ) => {
    const value = e.target.value
    if (variable === 'maxUrls') {
      setMaxUrls(value)
    }
  }

  const handleSubmit = async () => {
    if (validateUrl(url)) {
      setLoadingSpinner(true)

      if (is_new_course) {
        // set course exists in new metadata endpoint
        const response = await callSetCourseMetadata(courseName, {
          course_owner: current_user_email,
          // Don't set properties we don't know about. We'll just upsert and use the defaults.
          course_admins: [],
          approved_emails_list: [],
          is_private: false,
          banner_image_s3: undefined,
          course_intro_message: undefined,
          openai_api_key: undefined,
          example_questions: undefined,
          system_prompt: undefined,
          disabled_models: undefined,
          project_description: undefined,
          documentsOnly: undefined,
          disableCitations: undefined,
          guidedLearning: undefined,
          systemPromptOnly: undefined,
          vector_search_rewrite_disabled: undefined,
          allow_logged_in_users: undefined,
          is_frozen: undefined,
        })
        if (!response) {
          throw new Error('Error while setting course metadata')
        }
      }

      let data = null
      // Make API call based on URL
      if (url.includes('coursera.org')) {
        // TODO: coursera ingest
        alert(
          'Coursera ingest is not yet automated (auth is hard). Please email rohan13@illinois.edu to do it for you',
        )
      } else if (url.includes('ocw.mit.edu')) {
        data = downloadMITCourse(url, courseName, 'local_dir') // no await -- do in background

        showWebScrapeStartedToast()
      } else if (url.includes('canvas.illinois.edu/courses/')) {
        const response = await fetch('/api/UIUC-api/ingestCanvas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            courseName: courseName,
            canvas_url: url,
            selectedCanvasOptions: selectedCanvasOptions,
          }),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        if (data && data.error) {
          throw new Error(data.error)
        }
        await new Promise((resolve) => setTimeout(resolve, 8000)) // wait a moment before redirecting
        console.log('Canvas content ingestion was successful!')
      } else {
        // Standard web scrape
        try {
          await scrapeWeb(
            url,
            courseName,
            maxUrls.trim() !== '' ? parseInt(maxUrls) : 50,
            scrapeStrategy,
          )
        } catch (error: any) {
          console.error('Error while scraping web:', error)
        }
        // let ingest finalize things. It should be finished, but the DB is slow.
        await new Promise((resolve) => setTimeout(resolve, 8000))
      }
    } else {
      alert('Invalid URL (please include https://)')
    }
    setLoadingSpinner(false)
    setUrl('') // clear url
    if (is_new_course) {
      await router.push(`/${courseName}/dashboard`)
    }
    // No need to refresh, our materials table auto-refreshes.
  }

  const [inputErrors, setInputErrors] = useState({
    maxUrls: { error: false, message: '' },
  })

  const validateInputs = () => {
    const errors = {
      maxUrls: { error: false, message: '' },
    }
    // Check for maxUrls
    if (!maxUrls) {
      errors.maxUrls = {
        error: true,
        message: 'Please provide an input for Max Pages',
      }
    } else if (!/^\d+$/.test(maxUrls)) {
      // Using regex to ensure the entire string is a number
      errors.maxUrls = {
        error: true,
        message: 'Max Pages should be a valid number',
      }
    } else if (parseInt(maxUrls) < 1 || parseInt(maxUrls) > 500) {
      errors.maxUrls = {
        error: true,
        message: 'Max Pages should be between 1 and 500',
      }
    }

    setInputErrors(errors)
    return !Object.values(errors).some((error) => error.error)
  }

  const showWebScrapeStartedToast = () => {
    showToast({
      type: 'info',
      autoClose: 15000,
      title: 'Web scraping started',
      message:
        "It'll scrape in the background, just wait for the results to show up in your project (~3 minutes total).\nThis feature is stable but the web is a messy place. If you have trouble, I'd love to fix it. Just shoot me an email: rohan13@illinois.edu.",
      icon: <IconWorldDownload size={16} />,
    })
  }

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

      showToast({
        type: 'error',
        autoClose: 12000,
        title: 'Error during web scraping. Please try again.',
        message: error.message,
      })
      throw error
    }
  }

  const downloadMITCourse = async (
    url: string | null,
    courseName: string | null,
    localDir: string | null,
  ) => {
    try {
      if (!url || !courseName || !localDir) return null
      console.log('calling downloadMITCourse')
      const response = await axios.get(`/api/UIUC-api/downloadMITCourse`, {
        params: {
          url: url,
          course_name: courseName,
          local_dir: localDir,
        },
      })
      return response.data
    } catch (error) {
      console.error('Error during MIT course download:', error)
      return null
    }
  }

  useEffect(() => {
    if (url && url.length > 0 && validateUrl(url)) {
      setIsUrlUpdated(true)
    } else {
      setIsUrlUpdated(false)
    }
  }, [url])

  return (
    <>
      <h3
        className={`heading-h3 w-full text-center ${montserrat_heading.variable} font-montserratHeading pt-4`}
      >
        OR
      </h3>
      <h4
        className={`heading-h4 w-full text-center ${montserrat_heading.variable} font-montserratHeading mt-4`}
      >
        Web scrape any website that allows it
      </h4>

      {loadingSpinner && (
        <>
          <div className="relative mt-4 w-[80%] min-w-80 lg:w-[75%]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 [&_img]:h-6 [&_img]:w-6 [&_img]:object-contain"
            >
              {icon}
            </span>
            <Input
              aria-label="Enter URL to scrape"
              className="h-12 w-full truncate rounded-full border-(--background-dark) bg-(--background) pr-24 pl-11 text-(--foreground) disabled:bg-(--background-faded)"
              placeholder="Enter URL..."
              type="url"
              value={url}
              disabled={isDisabled}
              onChange={(e) => {
                setUrl(e.target.value)
                if (e.target.value.includes('coursera.org')) {
                  setIcon(
                    <img
                      src={'/media/coursera_logo_cutout.png'}
                      alt="Coursera Logo"
                    />,
                  )
                } else if (e.target.value.includes('ocw.mit.edu')) {
                  setIcon(
                    <img src={'/media/mitocw_logo.jpg'} alt="MIT OCW Logo" />,
                  )
                } else if (e.target.value.includes('github.com')) {
                  setIcon(
                    <img
                      src="/media/github-mark-white.png"
                      alt="GitHub Logo"
                    />,
                  )
                } else if (e.target.value.includes('canvas.illinois.edu')) {
                  setIcon(
                    <img src="/media/canvas_logo.png" alt="Canvas Logo" />,
                  )
                } else {
                  setIcon(<IconWorldDownload size={24} aria-hidden="true" />)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSubmit()
                }
              }}
            />
            <Button
              onClick={(e) => {
                e.preventDefault()
                if (validateInputs() && validateUrl(url)) {
                  handleSubmit()
                }
              }}
              className={`absolute top-1/2 right-1 min-w-20 -translate-y-1/2 rounded-full p-2 text-ellipsis ${
                isUrlUpdated
                  ? 'bg-(--dashboard-button)'
                  : 'border-(--dashboard-button)'
              } text-(--dashboard-button-foreground) hover:bg-(--dashboard-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dashboard-button)`}
              disabled={isDisabled}
            >
              Ingest
            </Button>
          </div>
          <div className="pt-4" />
          <p
            className={`${montserrat_heading.variable} font-montserratHeading text-base text-(--foreground)`}
          >
            Web scrape in progress...
          </p>
          <p
            className={`pb-3 text-center ${montserrat_paragraph.variable} font-montserratParagraph max-w-[80%] text-(--foreground)`}
          >
            Page refreshes upon completion. Your documents stay safe even if you
            navigate away.
          </p>
          <LoadingSpinner />
        </>
      )}

      {!loadingSpinner && (
        <>
          {/*! THIS BOX IS DUPLICATED (from above). KEEP BOTH IN SYNC. For Loading states. */}
          <div className="relative mt-4 w-[80%] min-w-80 lg:w-[75%]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 [&_img]:h-6 [&_img]:w-6 [&_img]:object-contain"
            >
              {icon}
            </span>
            <Input
              aria-label="Enter URL to scrape"
              className="h-12 w-full truncate rounded-full border-(--background-dark) bg-(--background) pr-24 pl-11 text-(--foreground) disabled:bg-(--background-faded)"
              placeholder="Enter URL..."
              type="url"
              value={url}
              disabled={isDisabled}
              onChange={(e) => {
                setUrl(e.target.value)
                if (e.target.value.includes('coursera.org')) {
                  setIcon(
                    <img
                      src={'/media/coursera_logo_cutout.png'}
                      alt="Coursera Logo"
                    />,
                  )
                } else if (e.target.value.includes('ocw.mit.edu')) {
                  setIcon(
                    <img src={'/media/mitocw_logo.jpg'} alt="MIT OCW Logo" />,
                  )
                } else if (e.target.value.includes('github.com')) {
                  setIcon(
                    <img
                      src="/media/github-mark-white.png"
                      alt="GitHub Logo"
                    />,
                  )
                } else if (e.target.value.includes('canvas.illinois.edu')) {
                  setIcon(
                    <img src="/media/canvas_logo.png" alt="Canvas Logo" />,
                  )
                } else {
                  setIcon(<IconWorldDownload size={24} aria-hidden="true" />)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSubmit()
                }
              }}
            />
            <Button
              onClick={(e) => {
                e.preventDefault()
                if (validateInputs() && validateUrl(url)) {
                  handleSubmit()
                }
              }}
              className={`absolute top-1/2 right-1 min-w-20 -translate-y-1/2 rounded-full p-2 text-ellipsis ${
                isUrlUpdated
                  ? 'bg-(--dashboard-button)'
                  : 'border-(--dashboard-button)'
              } text-(--dashboard-button-foreground) hover:bg-(--dashboard-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dashboard-button)`}
              disabled={isDisabled}
            >
              Ingest
            </Button>
          </div>

          {/* Detailed web ingest form */}

          <form
            className="w-[80%] min-w-80 lg:w-[75%]"
            onSubmit={(event) => {
              event.preventDefault()
            }}
          >
            <div className="pt-2 pb-2">
              <div className="flex items-center gap-1">
                <p
                  className={`${montserrat_heading.variable} font-montserratHeading text-base text-(--foreground)`}
                >
                  Max Pages (1 to 500)
                </p>
                <Tooltip>
                  <TooltipTrigger
                    render={<span className="inline-flex items-center" />}
                  >
                    <IconHelp
                      size={16}
                      aria-hidden="true"
                      className="text-(--foreground-faded)"
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[400px] text-wrap">
                    We will attempt to visit this number of pages, but not all
                    will be scraped if they&apos;re duplicates, broken or
                    otherwise inaccessible.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                name="maximumUrls"
                aria-label="Max Pages (1 to 500)"
                placeholder="Default 50"
                value={maxUrls}
                onChange={(e) => {
                  handleInputChange(e, 'maxUrls')
                }}
                aria-invalid={inputErrors.maxUrls.error}
                className="mt-2 h-11 w-full rounded-md border-(--background-dark) bg-(--background-faded) text-(--foreground)"
              />
            </div>
            {inputErrors.maxUrls.error && (
              <p className="text-(--destructive)">
                {inputErrors.maxUrls.message}
              </p>
            )}

            <p
              className={`${montserrat_heading.variable} font-montserratHeading text-base text-(--foreground)`}
            >
              Limit web crawl
            </p>
            <div className="pl-3">
              <ul className="list-inside list-disc space-y-2 text-(--foreground)">
                <li>
                  <strong>Equal and Below:</strong> Only scrape content that
                  starts will the given URL. E.g. nasa.gov/blogs will scrape all
                  blogs like nasa.gov/blogs/new-rocket but never go to
                  nasa.gov/events.
                </li>
                <li>
                  <strong>Same subdomain:</strong> Crawl the entire subdomain.
                  E.g. docs.nasa.gov will grab that entire subdomain, but not
                  nasa.gov or api.nasa.gov.
                </li>
                <li>
                  <strong>Entire domain:</strong> Crawl as much of this entire
                  website as possible. E.g. nasa.gov also includes docs.nasa.gov
                </li>
                <li>
                  <span>
                    <strong>All:</strong> Start on the given URL and wander the
                    web...{' '}
                    <span>
                      For more detail{' '}
                      <a
                        className={
                          'text-(--dashboard-button) hover:text-(--dashboard-button-hover)'
                        }
                        href="https://docs.uiuc.chat/features/web-crawling-details"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        read the docs
                      </a>
                      .
                    </span>
                  </span>
                </li>
              </ul>
            </div>

            <p className="text-(--foreground)">
              <strong>I suggest starting with Equal and Below</strong>, then
              just re-run this if you need more later.
            </p>
            <div className="pt-2"></div>
            <div
              role="radiogroup"
              aria-label="Limit web crawl strategy"
              className="flex flex-col gap-1 rounded-md bg-(--background-faded) p-1"
            >
              {(
                [
                  {
                    value: 'equal-and-below',
                    label: 'Equal and Below',
                    Icon: IconSitemap,
                  },
                  {
                    value: 'same-hostname',
                    label: 'Subdomain',
                    Icon: IconSubtask,
                  },
                  {
                    value: 'same-domain',
                    label: 'Entire domain',
                    Icon: IconHome,
                  },
                  { value: 'all', label: 'All', Icon: IconWorld },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scrapeStrategy === value}
                  onClick={() => setScrapeStrategy(value)}
                  className={`flex items-center justify-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    scrapeStrategy === value
                      ? 'bg-(--dashboard-button) text-(--dashboard-button-foreground)'
                      : 'text-(--foreground) hover:text-(--dashboard-button)'
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </form>
        </>
      )}
    </>
  )
}
