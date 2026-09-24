import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '~/pages/api/UIUC-api/announcementBanner'
import { ensureRedisConnected } from '~/utils/redisClient'

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

function storeBanner(raw: string | undefined) {
  mockedRedis.mockResolvedValue({ hGet: vi.fn().mockResolvedValue(raw) })
}

beforeEach(() => {
  mockedRedis.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/UIUC-api/announcementBanner', () => {
  it('405s on anything but GET', async () => {
    const res = createRes()
    await handler({ method: 'POST' } as any, res)

    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET')
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns only the public fields of a configured banner', async () => {
    storeBanner(
      JSON.stringify({
        enabled: true,
        message: 'Scheduled downtime tonight',
        linkText: 'Details',
        linkUrl: 'https://status.illinois.edu',
        updatedAt: '2026-09-24T00:00:00.000Z',
        updatedBy: 'admin@illinois.edu',
      }),
    )

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.json).toHaveBeenCalledWith({
      banner: {
        enabled: true,
        message: 'Scheduled downtime tonight',
        linkText: 'Details',
        linkUrl: 'https://status.illinois.edu',
      },
    })
  })

  it('returns null when no banner is stored', async () => {
    storeBanner(undefined)

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ banner: null })
  })

  it('returns null for a stored record that fails validation', async () => {
    storeBanner('{not json')

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ banner: null })
  })

  it('503s instead of null when Redis is unreachable', async () => {
    mockedRedis.mockRejectedValue(new Error('redis down'))

    const res = createRes()
    await handler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Announcement banner is unavailable',
    })
  })
})
