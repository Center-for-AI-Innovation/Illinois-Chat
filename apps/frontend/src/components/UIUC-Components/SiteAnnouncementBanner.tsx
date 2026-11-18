import { useRouter } from 'next/router'
import { useLayoutEffect, useRef } from 'react'
import { AnnouncementBanner } from '~/components/UIUC-Components/AnnouncementBanner'
import { useFetchAnnouncementBanner } from '~/hooks/queries/useFetchAnnouncementBanner'
import type { AnnouncementBanner as AnnouncementBannerValue } from '~/utils/platformSettings.schema'

/**
 * Only /silent-renew, the hidden Keycloak iframe, is exempt. /admin shows the
 * saved announcement like every other page; its live preview of unsaved draft
 * text is separate and does not depend on this list.
 */
const BANNER_EXEMPT_PREFIXES = ['/silent-renew']

const HEIGHT_VARIABLE = '--announcement-banner-height'

interface SiteAnnouncementBannerProps {
  /** The page's statically generated banner, when it has one (home only). */
  initialBanner?: AnnouncementBannerValue | null
  /** Epoch ms at which `initialBanner` was read from Redis. */
  initialBannerReadAt?: number
}

/**
 * The announcement bar on every page. Rendered inside `SiteHeader`, which
 * makes it sticky together with the navbar, so the two can't overlap.
 *
 * Its measured height is published as `--announcement-banner-height`. Only
 * fixed sidebars and sticky sub-bars read that variable; the navbar does not.
 */
export function SiteAnnouncementBanner({
  initialBanner,
  initialBannerReadAt,
}: SiteAnnouncementBannerProps) {
  const router = useRouter()
  const isExempt = BANNER_EXEMPT_PREFIXES.some((prefix) =>
    router.pathname.startsWith(prefix),
  )
  const { data: banner } = useFetchAnnouncementBanner({
    initialBanner,
    initialBannerReadAt,
    enabled: !isExempt,
  })
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
        banner={banner ?? null}
        legacyFallback={isSplash}
        preserveEmptySpace={isSplash}
      />
    </div>
  )
}

export default SiteAnnouncementBanner
