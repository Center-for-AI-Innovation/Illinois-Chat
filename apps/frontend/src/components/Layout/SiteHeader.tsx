import { useRouter } from 'next/router'
import { getSiteNavbarOptions } from '~/components/Layout/site-header-routes'
import { SiteAnnouncementBanner } from '~/components/UIUC-Components/SiteAnnouncementBanner'
import Navbar from '~/components/UIUC-Components/navbars/Navbar'

/**
 * The one sticky header for the site: the announcement bar, then the navbar
 * when the route has one (see `site-header-routes.ts`).
 *
 * Both live in the same sticky block in normal flow. The navbar therefore sits
 * directly under the bar from the first paint, including the server-rendered
 * splash page, and cannot overlap it. No measured height is needed to place the
 * navbar. Mounted once by `_app`, so there is one banner fetch and one navbar.
 *
 * The banner's first paint comes from the shared site-status cache, which
 * `_app` seeds from the page props; this component takes no seed props.
 */
export function SiteHeader() {
  const router = useRouter()
  const navbar = getSiteNavbarOptions(router.pathname)

  return (
    <div className="sticky top-0 z-50">
      <SiteAnnouncementBanner />
      {navbar && <Navbar {...navbar} />}
    </div>
  )
}

export default SiteHeader
