import { cva } from 'class-variance-authority'
import { useRouter } from 'next/router'
import { getSiteNavbarOptions } from '~/components/Layout/site-header-routes'
import { SiteAnnouncementBanner } from '~/components/UIUC-Components/SiteAnnouncementBanner'
import Navbar from '~/components/UIUC-Components/navbars/Navbar'
import type { AnnouncementBanner } from '~/utils/platformSettings.schema'

interface SiteHeaderProps {
  /** Forwarded to SiteAnnouncementBanner; see that component for details. */
  initialBanner?: AnnouncementBanner | null
  initialBannerReadAt?: number
}

/**
 * `sticky` keeps the header on screen while the page scrolls. `scroll` leaves
 * it in normal flow so it scrolls away with the page, which is how the splash
 * page behaves in production: its orange strip and navbar are not pinned.
 */
const siteHeaderVariants = cva('z-50', {
  variants: {
    position: {
      sticky: 'sticky top-0',
      scroll: 'relative',
    },
  },
})

/**
 * The one header for the site: the announcement bar, then the navbar when the
 * route has one (see `site-header-routes.ts`).
 *
 * Both live in the same block in normal flow. The navbar therefore sits
 * directly under the bar from the first paint, including the server-rendered
 * splash page, and cannot overlap it. No measured height is needed to place the
 * navbar. Mounted once by `_app`, so there is one banner fetch and one navbar.
 *
 * The block is sticky on every route except the splash page, where it scrolls
 * away with the page.
 */
export function SiteHeader({
  initialBanner,
  initialBannerReadAt,
}: SiteHeaderProps) {
  const router = useRouter()
  const navbar = getSiteNavbarOptions(router.pathname)
  const position = navbar?.variant === 'splash' ? 'scroll' : 'sticky'

  return (
    <div data-position={position} className={siteHeaderVariants({ position })}>
      <SiteAnnouncementBanner
        initialBanner={initialBanner}
        initialBannerReadAt={initialBannerReadAt}
      />
      {navbar && <Navbar {...navbar} />}
    </div>
  )
}

export default SiteHeader
