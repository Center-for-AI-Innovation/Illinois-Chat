import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_NAVBAR_HEIGHT,
  getSiteNavbarHeight,
  getSiteNavbarOptions,
  routeHasSiteNavbar,
  SETTINGS_LAYOUT_ROUTES,
  SPLASH_NAVBAR_HEIGHT,
} from '~/components/Layout/site-header-routes'

// Vitest runs from apps/frontend, so `src/` is a stable base for the file checks.
const SRC = join(process.cwd(), 'src')

function read(relativeToSrc: string) {
  return readFileSync(join(SRC, relativeToSrc), 'utf8')
}

function exists(relativeToSrc: string) {
  return existsSync(join(SRC, relativeToSrc))
}

/**
 * The source files a settings route passes through before it reaches
 * `SettingsLayout`. Each entry must reference the layout, directly or through
 * the components listed after it. Changing a route's page so it no longer
 * renders the settings layout should fail this test, not silently change the
 * navbar alignment.
 */
const SETTINGS_RENDER_CHAINS: Record<
  (typeof SETTINGS_LAYOUT_ROUTES)[number],
  string[]
> = {
  '/[course_name]/analysis': [
    'pages/[course_name]/analysis.tsx',
    'components/UIUC-Components/MakeQueryAnalysisPage.tsx',
  ],
  '/[course_name]/api': ['pages/[course_name]/api.tsx'],
  '/[course_name]/dashboard': [
    'pages/[course_name]/dashboard.tsx',
    'components/UIUC-Components/MakeOldCoursePage.tsx',
  ],
  '/[course_name]/llms': [
    'pages/[course_name]/llms.tsx',
    'components/UIUC-Components/api-inputs/LLMsApiKeyInputForm.tsx',
  ],
  '/[course_name]/prompt': ['pages/[course_name]/prompt.tsx'],
  '/[course_name]/tools': [
    'pages/[course_name]/tools.tsx',
    'components/UIUC-Components/SimPage.tsx',
  ],
  '/[course_name]/upload': ['pages/[course_name]/upload.tsx'],
}

const LAYOUT_IMPORT = 'components/Layout/SettingsLayout'

describe('site header route config', () => {
  describe('settings routes keep the sidebar-aligned navbar (#421)', () => {
    it.each(SETTINGS_LAYOUT_ROUTES)('%s aligns to the sidebar', (route) => {
      expect(getSiteNavbarOptions(route)).toEqual({ contentWidth: 'sidebar' })
    })

    it('lists every settings route, and only those, with the sidebar width', () => {
      const sidebarRoutes = Object.keys(SETTINGS_RENDER_CHAINS).sort()
      expect([...SETTINGS_LAYOUT_ROUTES].sort()).toEqual(sidebarRoutes)
    })

    it.each(SETTINGS_LAYOUT_ROUTES)(
      '%s is a real page that renders SettingsLayout',
      (route) => {
        const chain = SETTINGS_RENDER_CHAINS[route]
        for (const file of chain) {
          expect(exists(file), file).toBe(true)
        }
        const reachesLayout = chain.some((file) =>
          read(file).includes(LAYOUT_IMPORT),
        )
        expect(reachesLayout).toBe(true)
      },
    )
  })

  describe('navbar row height token', () => {
    it('is 72px on the splash page, the row without a divider', () => {
      expect(getSiteNavbarHeight('/')).toBe(SPLASH_NAVBAR_HEIGHT)
      expect(SPLASH_NAVBAR_HEIGHT).toBe('72px')
    })

    it.each([
      '/chatbots',
      '/admin',
      '/explore',
      '/new',
      '/chat',
      '/[course_name]/chat',
      '/[course_name]/dashboard',
      '/[course_name]/api',
      '/terms',
      '/silent-renew',
    ])('%s is the 80px application row with its divider', (pathname) => {
      expect(getSiteNavbarHeight(pathname)).toBe(APP_NAVBAR_HEIGHT)
      expect(APP_NAVBAR_HEIGHT).toBe('80px')
    })
  })

  describe('other routes', () => {
    it.each([
      ['/', { variant: 'splash' }],
      // Full-width navbar on admin (#421); the admin body is centred in admin.tsx.
      ['/admin', {}],
      ['/chatbots', { hideBorder: true }],
      ['/explore', {}],
      ['/new', {}],
      // Chat workspace: `Home` and the chat empty state share the header.
      ['/chat', {}],
      ['/[course_name]/chat', {}],
      ['/search-all', {}],
      ['/extreme', {}],
    ])('%s gets its navbar options', (route, options) => {
      expect(getSiteNavbarOptions(route)).toEqual(options)
      expect(routeHasSiteNavbar(route)).toBe(true)
    })

    it.each([
      '/terms',
      '/privacy',
      '/disclaimer',
      '/cropwizard-licenses',
      '/newsletter-unsubscribe',
      '/[course_name]',
      '/[course_name]/gpt4',
      '/silent-renew',
    ])('%s renders no navbar', (route) => {
      expect(getSiteNavbarOptions(route)).toBeNull()
      expect(routeHasSiteNavbar(route)).toBe(false)
    })

    it('does not treat inherited object keys as routes', () => {
      expect(getSiteNavbarOptions('constructor')).toBeNull()
      expect(getSiteNavbarOptions('__proto__')).toBeNull()
    })

    it('maps only routes that have a page file', () => {
      const mapped = [
        '/',
        '/admin',
        '/chatbots',
        '/explore',
        '/new',
        '/chat',
        '/search-all',
        '/extreme',
        '/[course_name]/chat',
        ...SETTINGS_LAYOUT_ROUTES,
      ]
      for (const route of mapped) {
        const file = route === '/' ? 'pages/index.tsx' : `pages${route}.tsx`
        expect(exists(file), file).toBe(true)
      }
    })
  })
})
