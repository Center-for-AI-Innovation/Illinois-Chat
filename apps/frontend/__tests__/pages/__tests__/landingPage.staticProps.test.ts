import type { GetStaticPropsContext } from 'next'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => ({
  banner: { state: 'absent' } as unknown,
  branding: { state: 'absent' } as unknown,
}))

vi.mock('~/utils/platformSettings.server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    readAnnouncementBanner: vi.fn(async () => read.banner),
    readNavbarBranding: vi.fn(async () => read.branding),
  }
})

vi.mock('~/components/UIUC-Components/GlobalFooter', () => ({
  default: () => null,
}))

vi.mock('~/components/UIUC-Components/navbars/Navbar', () => ({
  default: () => null,
}))

import { getStaticProps } from '~/pages/index'

const UNAVAILABLE = { state: 'unavailable', reason: 'ECONNREFUSED' }
const savedPhase = process.env.NEXT_PHASE

function run() {
  return getStaticProps({} as GetStaticPropsContext)
}

function propsOf(result: Awaited<ReturnType<typeof run>>) {
  return (result as { props: Record<string, unknown> }).props
}

beforeEach(() => {
  delete process.env.NEXT_PHASE
  read.banner = { state: 'absent' }
  read.branding = { state: 'absent' }
})

afterEach(() => {
  if (savedPhase === undefined) delete process.env.NEXT_PHASE
  else process.env.NEXT_PHASE = savedPhase
})

describe('Landing page getStaticProps', () => {
  it('returns the banner, the brand, and when they were read', async () => {
    read.banner = {
      state: 'configured',
      value: {
        enabled: true,
        message: 'Downtime Saturday 8pm.',
        linkText: '',
        linkUrl: '',
        updatedAt: '2026-10-08T00:00:00.000Z',
        updatedBy: 'admin@illinois.edu',
      },
    }
    read.branding = {
      state: 'configured',
      value: { primaryWord: 'OSC', secondaryWord: 'Chat', logoVersion: '' },
    }
    const before = Date.now()

    const result = await run()

    expect(result).toMatchObject({
      props: {
        announcementBanner: {
          enabled: true,
          message: 'Downtime Saturday 8pm.',
          linkText: '',
          linkUrl: '',
        },
        navbarBranding: {
          primaryWord: 'OSC',
          secondaryWord: 'Chat',
          logoUrl: null,
        },
      },
      revalidate: 30,
    })
    const props = propsOf(result)
    expect(props.announcementBannerReadAt).toBeGreaterThanOrEqual(before)
    expect(props.navbarBrandingReadAt).toBe(props.announcementBannerReadAt)
  })

  it.each([
    ['the banner', 'banner'],
    ['the navbar brand', 'branding'],
  ] as const)(
    'throws at runtime when %s cannot be read so the last page is kept',
    async (_label, key) => {
      read[key] = UNAVAILABLE

      await expect(run()).rejects.toThrow(/Redis unavailable/)
    },
  )

  it('degrades during next build without baking in the default brand', async () => {
    process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD
    read.banner = UNAVAILABLE
    read.branding = UNAVAILABLE

    const props = propsOf(await run())

    expect(props.announcementBanner).toBeNull()
    expect(props).not.toHaveProperty('navbarBranding')
    expect(props).not.toHaveProperty('navbarBrandingReadAt')
  })
})
