import { useRouter } from 'next/router'
import { useLayoutEffect, useRef } from 'react'
import { AnnouncementBanner } from '~/components/UIUC-Components/AnnouncementBanner'
import {
  isStatusPollExempt,
  useFetchSiteStatus,
} from '~/hooks/queries/useFetchSiteStatus'

const HEIGHT_VARIABLE = '--announcement-banner-height'

/**
 * The announcement bar on every page. Rendered inside `SiteHeader`, which
 * makes it sticky together with the navbar, so the two can't overlap.
 *
 * Its measured height is published as `--announcement-banner-height`. Only
 * fixed sidebars and sticky sub-bars read that variable; the navbar does not.
 * The banner comes from the shared site-status query seeded by `_app`.
 */
export function SiteAnnouncementBanner() {
  const router = useRouter()
  // /admin is not exempt: its tab shows the saved live announcement and polls
  // for it. Only the hidden silent-renew iframe makes no status request.
  const isExempt = isStatusPollExempt(router.pathname)
  const { data: status } = useFetchSiteStatus({ enabled: !isExempt })
  const banner = status?.announcementBanner ?? null
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = document.documentElement
    const container = containerRef.current
    if (!container) {
      root.style.setProperty(HEIGHT_VARIABLE, '0px')
      return
    }

    const publish = () =>
      root.style.setProperty(HEIGHT_VARIABLE, `${container.offsetHeight}px`)
    publish()
    // The message wraps on narrow screens, so the height is not a constant.
    const observer = new ResizeObserver(publish)
    observer.observe(container)
    return () => {
      observer.disconnect()
      root.style.setProperty(HEIGHT_VARIABLE, '0px')
    }
  }, [isExempt])

  if (isExempt) return null

  // The splash page keeps its orange strip even with no message, so its navbar
  // sits below the same bar as when a message is active. Other pages show no
  // bar without a message.
  const isSplash = router.pathname === '/'

  return (
    <div ref={containerRef}>
      <AnnouncementBanner
        banner={banner}
        legacyFallback={isSplash}
        preserveEmptySpace={isSplash}
      />
    </div>
  )
}

export default SiteAnnouncementBanner
