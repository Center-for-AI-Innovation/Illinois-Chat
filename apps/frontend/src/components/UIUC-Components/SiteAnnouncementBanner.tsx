import { useRouter } from 'next/router'
import { useLayoutEffect, useRef } from 'react'
import { AnnouncementBanner } from '~/components/UIUC-Components/AnnouncementBanner'
import { useFetchAnnouncementBanner } from '~/hooks/queries/useFetchAnnouncementBanner'
import type { AnnouncementBanner as AnnouncementBannerValue } from '~/utils/platformSettings.schema'

/**
 * /admin renders its own live preview, and /silent-renew is the hidden
 * Keycloak iframe.
 */
const BANNER_EXEMPT_PREFIXES = ['/admin', '/silent-renew']

const HEIGHT_VARIABLE = '--announcement-banner-height'

interface SiteAnnouncementBannerProps {
  /** The page's statically generated banner, when it has one (home only). */
  initialBanner?: AnnouncementBannerValue | null
}

/**
 * The announcement bar on every page. Sticky and in normal flow, so it never
 * overlaps content before hydration; its measured height is published as
 * `--announcement-banner-height` for the fixed navbars and viewport-height
 * layouts that would otherwise sit underneath it.
 */
export function SiteAnnouncementBanner({
  initialBanner,
}: SiteAnnouncementBannerProps) {
  const router = useRouter()
  const isExempt = BANNER_EXEMPT_PREFIXES.some((prefix) =>
    router.pathname.startsWith(prefix),
  )
  const { data: banner } = useFetchAnnouncementBanner(initialBanner)
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

  return (
    <div ref={containerRef} className="sticky top-0 z-40">
      <AnnouncementBanner
        banner={banner ?? null}
        legacyFallback={router.pathname === '/'}
      />
    </div>
  )
}

export default SiteAnnouncementBanner
