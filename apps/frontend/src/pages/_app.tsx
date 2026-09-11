import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { appWithTranslation } from 'next-i18next'
import { type AppType } from 'next/app'

import Maintenance from '~/components/UIUC-Components/Maintenance'
import '~/styles/citation-tooltips.css'
import '~/styles/globals.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useRouter } from 'next/router'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect, useState, type ReactNode } from 'react'

// import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'

import { ThemeProvider } from '~/contexts/ThemeContext'
import { useFetchMaintenanceMode } from '~/hooks/queries/useFetchMaintenanceMode'
import { KeycloakProvider } from '../providers/KeycloakProvider'

// Routes that must stay reachable while maintenance mode is on.
//
// `/silent-renew` is the OIDC silent-renewal target and `/admin` is where an
// operator turns maintenance back off — gating either one makes maintenance
// unrecoverable. Note this list is only half the story: the gate itself now
// lives *below* KeycloakProvider so the sign-in callback (which Keycloak
// returns to `/`, not to an exempt path) is still processed. See MaintenanceGate.
const MAINTENANCE_EXEMPT_PREFIXES = ['/admin', '/silent-renew']

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
 * Fails open: while the check is in flight or errored, content renders. That
 * matches the previous `useState(false)` default.
 */
function MaintenanceGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const isExempt = MAINTENANCE_EXEMPT_PREFIXES.some((prefix) =>
    router.pathname.startsWith(prefix),
  )
  const { data: isMaintenanceMode } = useFetchMaintenanceMode({
    enabled: !isExempt,
  })

  if (!isExempt && isMaintenanceMode === true) {
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

const MyApp: AppType = ({ Component, pageProps: { ...pageProps } }) => {
  const router = useRouter()
  // Held in state so the cache survives re-renders. The maintenance gate reads
  // through React Query now, and a client rebuilt every render would drop that
  // cache and refetch on each render.
  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => {
    // Track page views in PostHog
    const handleRouteChange = () => posthog?.capture('$pageview')
    router.events.on('routeChangeComplete', handleRouteChange)

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

  return (
    <div
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
            <aside
              aria-label="Notifications"
              aria-live="assertive"
              aria-atomic="true"
            >
              <Notifications position="bottom-center" zIndex={2077} />
            </aside>
            <ReactQueryDevtools
              initialIsOpen={false}
              position="left"
              buttonPosition="bottom-right"
            />
            <MantineProvider
              withGlobalStyles
              withNormalizeCSS
              theme={{
                colorScheme: 'dark',
                colors: {
                  // Using CSS variables for colors
                  deepBlue: ['var(--illinois-blue)'],
                  primary: ['var(--illinois-orange)'],
                  secondary: ['var(--illinois-blue)'],
                  accent: ['var(--illinois-industrial)'],
                  background: ['var(--illinois-background-dark)'],
                  nearlyBlack: ['var(--illinois-background-darker)'],
                  nearlyWhite: ['var(--illinois-white)'],
                  disabled: ['var(--illinois-storm-dark)'],
                  errorBackground: ['var(--illinois-berry)'],
                  errorBorder: ['var(--illinois-berry)'],
                },
                shadows: {
                  // md: '1px 1px 3px rgba(0, 0, 0, .25)',
                  // xl: '5px 5px 3px rgba(0, 0, 0, .25)',
                },
                headings: {
                  fontFamily: 'Montserrat, Roboto, sans-serif',
                  sizes: {
                    h1: { fontSize: '3rem' },
                    h2: { fontSize: '2.2rem' },
                  },
                },
                defaultGradient: {
                  from: 'var(--illinois-berry)',
                  to: 'var(--illinois-earth)',
                  deg: 80,
                },
              }}
            >
              <ThemeProvider>
                <MaintenanceGate>
                  <Component {...pageProps} />
                </MaintenanceGate>
              </ThemeProvider>
            </MantineProvider>
          </PostHogProvider>
        </QueryClientProvider>
      </KeycloakProvider>
    </div>
  )
}

// export default .withTRPC(MyApp)

export default appWithTranslation(MyApp)
