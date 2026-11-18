import { appWithTranslation } from 'next-i18next/pages'
import nextI18NextConfig from '../../next-i18next.config.mjs'
import { type AppType } from 'next/app'

import { SiteHeader } from '~/components/Layout/SiteHeader'
import {
  getSiteNavbarHeight,
  routeHasSiteNavbar,
} from '~/components/Layout/site-header-routes'
import Maintenance from '~/components/UIUC-Components/Maintenance'
import '~/styles/citation-tooltips.css'
import '~/styles/globals.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useRouter } from 'next/router'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

// import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'

import { ThemeProvider } from '~/contexts/ThemeContext'
import {
  isSiteStatusExempt,
  SITE_STATUS_QUERY_KEY,
  useFetchSiteStatus,
  type SiteStatus,
} from '~/hooks/queries/useFetchSiteStatus'
import { NAVBAR_BRANDING_QUERY_KEY } from '~/hooks/queries/useFetchNavbarBranding'
import type {
  AnnouncementBanner,
  NavbarBranding,
} from '~/utils/platformSettings.schema'
import { KeycloakProvider } from '../providers/KeycloakProvider'
import { Toaster } from '@/components/shadcn/ui/sonner'

/**
 * Swaps page content for the maintenance notice, leaving the surrounding
 * provider tree — crucially KeycloakProvider and AuthCookie — mounted.
 *
 * This must NOT be hoisted above the auth provider. `redirect_uri` is the bare
 * origin, so Keycloak returns users to `/` carrying `?code=&state=`, and it is
 * KeycloakProvider that exchanges that code. Short-circuiting above it drops
 * the code on the floor and locks everyone out, including whoever needs to
 * disable maintenance.
 *
 * Routes that must stay reachable while maintenance is on — `/admin` (where an
 * operator turns it back off) and `/silent-renew` (the OIDC renewal target) —
 * are exempt via `isSiteStatusExempt`, which the banner shares.
 *
 * Fails open: while the check is in flight or errored, content renders. That
 * matches the previous `useState(false)` default.
 */
function MaintenanceGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const isExempt = isSiteStatusExempt(router.pathname)
  const { data: status } = useFetchSiteStatus({ enabled: !isExempt })

  if (!isExempt && status?.isMaintenanceMode === true) {
    return <Maintenance />
  }
  return <>{children}</>
}

// Check that PostHog is client-side (used to handle Next.js SSR)
if (typeof window !== 'undefined') {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    'https://posthog-dev.ilchat.mss.illinois.edu'

  if (!key) {
    console.warn('⚠️  No POSTHOG key—skipping init.')
  } else {
    posthog.init(key, {
      api_host: host,
      opt_in_site_apps: true,
      autocapture: false,
      person_profiles: 'always',
      defaults: '2025-05-24',
      session_recording: {
        maskAllInputs: false,
        maskInputOptions: {
          password: true,
          email: true,
          // @ts-expect-error TODO: Object literal may only specify known properties, and 'creditCard' does not exist...
          creditCard: true,
        },
      },
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') posthog.debug()
      },
    })
  }
}

/** Set only by pages whose getStaticProps reads platform settings (home). */
interface SiteBannerPageProps {
  announcementBanner?: AnnouncementBanner | null
  announcementBannerReadAt?: number
  navbarBranding?: NavbarBranding
  navbarBrandingReadAt?: number
}

const MyApp: AppType = ({ Component, pageProps: { ...pageProps } }) => {
  const router = useRouter()
  // Held in state so the cache survives re-renders. The maintenance gate reads
  // through React Query now, and a client rebuilt every render would drop that
  // cache and refetch on each render.
  const [queryClient] = useState(() => {
    const client = new QueryClient()
    // Seeded once so a statically generated page paints its banner and navbar
    // brand without waiting on a fetch; later navigations reuse the cache.
    // Stamped with the read time so an old ISR page is refetched, not trusted.
    // The seeded status carries no maintenance state, so the status query
    // refetches it on mount regardless of age (see useFetchSiteStatus).
    const {
      announcementBanner,
      announcementBannerReadAt,
      navbarBranding,
      navbarBrandingReadAt,
    } = pageProps as SiteBannerPageProps
    if (announcementBanner !== undefined) {
      client.setQueryData<SiteStatus>(
        SITE_STATUS_QUERY_KEY,
        { announcementBanner },
        { updatedAt: announcementBannerReadAt ?? 0 },
      )
    }
    if (navbarBranding) {
      client.setQueryData(NAVBAR_BRANDING_QUERY_KEY, navbarBranding, {
        updatedAt: navbarBrandingReadAt ?? 0,
      })
    }
    return client
  })

  useEffect(() => {
    // Track page views in PostHog
    const handleRouteChange = () => posthog?.capture('$pageview')
    router.events.on('routeChangeComplete', handleRouteChange)

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

  // Layout tokens for the whole app, set from the route here (not in a head
  // style) so the header and page offsets are right on the first render, and a
  // splash-only value cannot leak into application routes.
  //  - `--navbar-height`: 72px on the splash page, 80px elsewhere.
  //  - `--page-viewport-height`: full-height page content below the header. It
  //    subtracts the navbar only on routes that render one.
  const pageViewportHeight = routeHasSiteNavbar(router.pathname)
    ? 'calc(var(--viewport-height) - var(--navbar-height))'
    : 'var(--viewport-height)'
  const layoutTokens = {
    '--navbar-height': getSiteNavbarHeight(router.pathname),
    '--page-viewport-height': pageViewportHeight,
  } as CSSProperties

  return (
    <div
      style={layoutTokens}
      onKeyDownCapture={(event) => {
        if (event.key === 'Tab') {
          document.documentElement.dataset.inputModality = 'keyboard'
        }
      }}
      onPointerDownCapture={() => {
        document.documentElement.dataset.inputModality = 'pointer'
      }}
      onMouseDownCapture={() => {
        document.documentElement.dataset.inputModality = 'pointer'
      }}
      onTouchStartCapture={() => {
        document.documentElement.dataset.inputModality = 'pointer'
      }}
    >
      <nav aria-label="Skip navigation">
        <a
          href="#main-content"
          className="skip-nav-link"
          onClick={(e) => {
            const target = document.getElementById('main-content')
            if (target) {
              e.preventDefault()
              target.focus()
              target.scrollIntoView()
            }
          }}
        >
          Skip to main content
        </a>
      </nav>
      <KeycloakProvider>
        <QueryClientProvider client={queryClient}>
          <PostHogProvider client={posthog}>
            {/* <SpeedInsights /> */}
            <Analytics />
            <ReactQueryDevtools
              initialIsOpen={false}
              position="left"
              buttonPosition="bottom-right"
            />
              <ThemeProvider>
              <Toaster position="bottom-center" />
              <MaintenanceGate>
                <SiteHeader />
                <Component {...pageProps} />
              </MaintenanceGate>
            </ThemeProvider>
          </PostHogProvider>
        </QueryClientProvider>
      </KeycloakProvider>
    </div>
  )
}

// export default .withTRPC(MyApp)

export default appWithTranslation(MyApp, nextI18NextConfig)
