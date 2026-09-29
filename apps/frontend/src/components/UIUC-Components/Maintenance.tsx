// Rendered by MaintenanceGate in _app.tsx in place of every non-exempt page.
// noindex for this state lives in _document.tsx so search results are not
// replaced by the maintenance notice.

import { RefreshCw, Wrench } from 'lucide-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { useEffect, useState } from 'react'
import { Badge } from '~/components/shadcn/ui/badge'
import { Button } from '~/components/shadcn/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '~/components/shadcn/ui/card'
import { Skeleton } from '~/components/shadcn/ui/skeleton'

const DEFAULT_TITLE = 'We’ll be right back'
const DEFAULT_BODY =
  'Illinois Chat is undergoing scheduled maintenance. Your projects and conversations are safe. Please check back shortly.'

interface MaintenanceNotice {
  title: string
  body: string
}

// The details endpoint requires a session, so signed-out visitors fall back to
// the defaults rather than seeing an empty card.
async function fetchNotice(signal: AbortSignal): Promise<MaintenanceNotice> {
  try {
    const response = await fetch('/api/UIUC-api/getMaintenanceModeDetails', {
      signal,
    })
    if (!response.ok) return { title: DEFAULT_TITLE, body: DEFAULT_BODY }
    const data = (await response.json()) as {
      maintenanceTitleText?: string | null
      maintenanceBodyText?: string | null
    }
    return {
      title: data.maintenanceTitleText?.trim() || DEFAULT_TITLE,
      body: data.maintenanceBodyText?.trim() || DEFAULT_BODY,
    }
  } catch (error) {
    if (signal.aborted) throw error
    return { title: DEFAULT_TITLE, body: DEFAULT_BODY }
  }
}

const Maintenance = () => {
  const [notice, setNotice] = useState<MaintenanceNotice | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchNotice(controller.signal)
      .then(setNotice)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`relative flex min-h-screen flex-col items-center overflow-hidden bg-white px-4 py-8 outline-none sm:px-6 sm:py-12 dark:bg-[#081735] ${montserrat_paragraph.variable} font-montserratParagraph`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-105 bg-[radial-gradient(ellipse_at_top,rgba(255,95,5,0.12),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(255,95,5,0.18),transparent_65%)]"
      />

      <div
        className={`relative flex items-center gap-2 ${montserrat_heading.variable} font-montserratHeading`}
      >
        <img
          alt=""
          src="/media/logo_illinois.png"
          className="h-9 w-auto sm:h-10"
        />
        <span className="text-2xl font-extrabold tracking-tight text-(--illinois-orange-branding) sm:text-[1.8rem]">
          Illinois <span className="text-(--illinois-blue) dark:text-white">Chat</span>
        </span>
      </div>

      <div className="relative flex w-full flex-1 items-center justify-center py-10 sm:py-16">
        <Card className="w-full max-w-xl gap-6 rounded-[14px] bg-white py-8 shadow-[0_4px_20px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e7eb] sm:py-10 dark:bg-[#13294b] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] dark:ring-[#32517a]">
          <CardHeader className="flex flex-col items-center gap-4 px-6 text-center sm:px-10">
            <div className="flex size-14 items-center justify-center rounded-full bg-(--illinois-orange)/10 text-(--illinois-orange) ring-8 ring-(--illinois-orange)/5">
              <Wrench className="size-6" aria-hidden="true" />
            </div>
            <Badge
              variant="outline"
              className="h-6 gap-1.5 rounded-[6px] border-(--illinois-orange)/40 bg-(--illinois-orange)/10 px-2 text-(--illinois-orange)"
            >
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-(--illinois-orange) opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-1.5 rounded-full bg-(--illinois-orange)" />
              </span>
              Maintenance in progress
            </Badge>
            {notice ? (
              <h1
                data-slot="card-title"
                className={`text-2xl leading-tight font-bold wrap-break-word text-(--illinois-blue) sm:text-3xl dark:text-white ${montserrat_heading.variable} font-montserratHeading`}
              >
                {notice.title}
              </h1>
            ) : (
              <Skeleton className="h-8 w-3/4 rounded-[8px]" />
            )}
          </CardHeader>

          <CardContent className="px-6 text-center sm:px-10">
            {notice ? (
              <CardDescription className="text-base leading-relaxed whitespace-pre-line text-(--illinois-storm-dark) wrap-break-word dark:text-[#c8d2e3]">
                {notice.body}
              </CardDescription>
            ) : (
              <div className="flex flex-col items-center gap-2" aria-busy="true">
                <Skeleton className="h-4 w-full rounded-[6px]" />
                <Skeleton className="h-4 w-5/6 rounded-[6px]" />
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col items-center gap-3 border-t border-[#e5e7eb] bg-transparent px-6 pt-6 sm:px-10 dark:border-[#32517a]">
            <Button
              type="button"
              variant="dashboard"
              onClick={() => window.location.reload()}
              className="w-full cursor-pointer rounded-[8px] sm:w-auto"
            >
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
            <p className="text-xs text-(--illinois-storm-medium) dark:text-[#94a3b8]">
              This page will not refresh on its own.
            </p>
          </CardFooter>
        </Card>
      </div>

      <p className="relative text-center text-xs text-(--illinois-storm-medium) dark:text-[#94a3b8]">
        University of Illinois Urbana-Champaign · NCSA
      </p>
    </main>
  )
}

export default Maintenance
