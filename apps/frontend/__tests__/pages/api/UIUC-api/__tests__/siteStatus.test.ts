import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '~/pages/api/UIUC-api/siteStatus'
import { ensureRedisConnected } from '~/utils/redisClient'
import { SITE_STATUS_CACHE_CONTROL } from '~/utils/siteStatusCache'

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(),
}))

const mockedRedis = ensureRedisConnected as unknown as ReturnType<typeof vi.fn>

function createRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn()
  return res
}

/** Redis with one settings field and one maintenance flag. */
function storeState({
  banner,
  maintenance,
}: {
  banner?: string
  maintenance?: string
}) {
  mockedRedis.mockResolvedValue({
    hGet: vi.fn().mockResolvedValue(banner),
    get: vi.fn().mockResolvedValue(maintenance),
  })
}

beforeEach(() => {
  mockedRedis.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const CONFIGURED_BANNER = JSON.stringify({
  enabled: true,
  message: 'Scheduled downtime tonight',
  linkText: 'Details',
  linkUrl: 'https://status.illinois.edu',
  updatedAt: '2026-09-24T00:00:00.000Z',
  updatedBy: 'admin@illinois.edu',
})

describe('GET /api/UIUC-api/siteStatus', () => {
  it('405s on anything but GET, and never caches the refusal', async () => {
    const res = createRes()
    await handler({ method: 'POST' } as any, res)

    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(405)
    expect(mockedRedis).not.toHaveBeenCalled()
  })

  it('returns the banner and maintenance flag with only public fields', async () => {
    storeState({ banner: CONFIGURED_BANNER, maintenance: 'true' })

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      announcementBanner: {
        enabled: true,
        message: 'Scheduled downtime tonight',
        linkText: 'Details',
        linkUrl: 'https://status.illinois.edu',
      },
      isMaintenanceMode: true,
    })
  })

  it('leaks no updater identity or maintenance copy in the body', async () => {
    storeState({ banner: CONFIGURED_BANNER, maintenance: 'true' })
    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    const body = JSON.stringify(res.json.mock.calls[0][0])
    expect(body).not.toContain('admin@illinois.edu')
    expect(body).not.toContain('updatedBy')
    expect(body).not.toContain('updatedAt')
    expect(body).not.toContain('maintenance-title')
  })

  it('reports maintenance off and no banner when nothing is stored', async () => {
    storeState({})

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      announcementBanner: null,
      isMaintenanceMode: false,
    })
  })

  it('treats a banner that fails validation as absent, like the legacy route', async () => {
    storeState({ banner: '{not json', maintenance: 'true' })

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      announcementBanner: null,
      isMaintenanceMode: true,
    })
  })

  it('sends a short shared-cache policy that always revalidates in the browser', async () => {
    storeState({ banner: CONFIGURED_BANNER, maintenance: 'true' })

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=0, s-maxage=5, must-revalidate',
    )
    expect(SITE_STATUS_CACHE_CONTROL).toBe(
      'public, max-age=0, s-maxage=5, must-revalidate',
    )
    // The poll is 60s. Any stale window beyond the shared-cache age would
    // delay a maintenance toggle past that, so it must not appear.
    expect(SITE_STATUS_CACHE_CONTROL).not.toContain('stale-while-revalidate')
  })

  it('503s with no-store when Redis is unreachable, rather than publishing defaults', async () => {
    mockedRedis.mockRejectedValue(new Error('redis down'))

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Site status is unavailable',
    })
  })

  it('503s when only the maintenance read fails, so the banner is not reported as absent', async () => {
    mockedRedis.mockResolvedValue({
      hGet: vi.fn().mockResolvedValue(CONFIGURED_BANNER),
      get: vi.fn().mockRejectedValue(new Error('timeout')),
    })

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ isMaintenanceMode: false }),
    )
  })

  it('answers an explicit post-save refresh with no-store and the same public payload', async () => {
    storeState({ banner: CONFIGURED_BANNER, maintenance: 'true' })

    const res = createRes()
    await handler(
      { method: 'GET', query: { fresh: '1789000000000' } } as any,
      res,
    )

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      announcementBanner: {
        enabled: true,
        message: 'Scheduled downtime tonight',
        linkText: 'Details',
        linkUrl: 'https://status.illinois.edu',
      },
      isMaintenanceMode: true,
    })
    const body = JSON.stringify(res.json.mock.calls[0][0])
    expect(body).not.toContain('admin@illinois.edu')
    expect(body).not.toContain('updatedAt')
  })

  it('never caches a failed explicit refresh either', async () => {
    mockedRedis.mockRejectedValue(new Error('redis down'))

    const res = createRes()
    await handler(
      { method: 'GET', query: { fresh: '1789000000000' } } as any,
      res,
    )

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('treats other query parameters as an ordinary poll, with the shared-cache policy', async () => {
    storeState({ banner: CONFIGURED_BANNER, maintenance: 'false' })

    const res = createRes()
    await handler({ method: 'GET', query: { utm: 'x' } } as any, res)

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      SITE_STATUS_CACHE_CONTROL,
    )
  })
})
