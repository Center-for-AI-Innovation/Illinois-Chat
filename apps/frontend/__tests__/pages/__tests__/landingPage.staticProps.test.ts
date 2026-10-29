import type { GetStaticPropsContext } from 'next'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => ({ result: { state: 'absent' } as unknown }))

vi.mock('~/utils/platformSettings.server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    readAnnouncementBanner: vi.fn(async () => read.result),
  }
})

vi.mock('~/components/UIUC-Components/GlobalFooter', () => ({
  default: () => null,
}))

vi.mock('~/components/UIUC-Components/navbars/GlobalHeader', () => ({
  LandingPageHeader: () => null,
}))

import { getStaticProps } from '~/pages/index'

const savedPhase = process.env.NEXT_PHASE

function run() {
  return getStaticProps({} as GetStaticPropsContext)
}

beforeEach(() => {
  delete process.env.NEXT_PHASE
})

afterEach(() => {
  if (savedPhase === undefined) delete process.env.NEXT_PHASE
  else process.env.NEXT_PHASE = savedPhase
})

describe('Landing page getStaticProps', () => {
  it('returns the banner and when it was read', async () => {
    read.result = {
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
      },
      revalidate: 30,
    })
    const props = (result as { props: { announcementBannerReadAt: number } })
      .props
    expect(props.announcementBannerReadAt).toBeGreaterThanOrEqual(before)
  })

  it('throws at runtime when Redis is unavailable so the last page is kept', async () => {
    read.result = { state: 'unavailable', reason: 'ECONNREFUSED' }

    await expect(run()).rejects.toThrow(/Redis unavailable/)
  })

  it('degrades to no banner during next build when Redis is unavailable', async () => {
    process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD
    read.result = { state: 'unavailable', reason: 'ECONNREFUSED' }

    const result = await run()

    expect(result).toMatchObject({ props: { announcementBanner: null } })
  })
})
