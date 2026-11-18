import type {
  NavbarContentWidth,
  NavbarVariant,
} from '~/components/UIUC-Components/navbars/Navbar'

export interface SiteNavbarOptions {
  variant?: NavbarVariant
  contentWidth?: NavbarContentWidth
  hideBorder?: boolean
}

/**
 * Course routes whose loaded page renders `SettingsLayout`. Their navbar aligns
 * with the settings sidebar (`contentWidth: 'sidebar'`), as it did when each
 * page mounted the navbar itself (#421). Each route reaches the layout as:
 *
 * - api, upload, prompt: direct `SettingsLayout`
 * - dashboard: `MakeOldCoursePage`
 * - analysis: `MakeQueryAnalysisPage`
 * - llms: `APIKeyInputForm` (LLMsApiKeyInputForm)
 * - tools: `SimPage`
 *
 * Loading, permission and unauthorized branches of these routes also show the
 * navbar, using the same alignment.
 */
export const SETTINGS_LAYOUT_ROUTES = [
  '/[course_name]/analysis',
  '/[course_name]/api',
  '/[course_name]/dashboard',
  '/[course_name]/llms',
  '/[course_name]/prompt',
  '/[course_name]/tools',
  '/[course_name]/upload',
] as const

const SETTINGS_NAVBAR: SiteNavbarOptions = { contentWidth: 'sidebar' }

/**
 * Which routes show the site navbar, and how. Keyed by `router.pathname`.
 *
 * Routes not listed here get no navbar, only the announcement bar. Pages used
 * to mount their own `<Navbar>`, but that put the navbar and the bar in
 * different parts of the tree, so they could not be positioned against each
 * other without measuring.
 */
const SITE_NAVBAR_BY_ROUTE: Record<string, SiteNavbarOptions> = {
  '/': { variant: 'splash' },
  '/admin': { contentWidth: 'page' },
  '/chatbots': { hideBorder: true },
  '/explore': {},
  '/new': {},
  // Chat workspace: `Home` and the chat empty state (`MainPageBackground`).
  '/chat': {},
  '/search-all': {},
  '/extreme': {},
  '/[course_name]/chat': {},
  ...Object.fromEntries(
    SETTINGS_LAYOUT_ROUTES.map((route) => [route, SETTINGS_NAVBAR]),
  ),
}

export function getSiteNavbarOptions(
  pathname: string,
): SiteNavbarOptions | null {
  if (!Object.prototype.hasOwnProperty.call(SITE_NAVBAR_BY_ROUTE, pathname)) {
    return null
  }
  return SITE_NAVBAR_BY_ROUTE[pathname] ?? null
}

export function routeHasSiteNavbar(pathname: string): boolean {
  return getSiteNavbarOptions(pathname) !== null
}
