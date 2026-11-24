import { beforeEach, describe, expect, it, vi } from 'vitest'
import brandingHandler from '~/pages/api/UIUC-api/navbarBranding'
import logoHandler from '~/pages/api/UIUC-api/navbarLogo'
import { logoVersionOf } from '~/utils/platformSettings.server'
import { ensureRedisConnected } from '~/utils/redisClient'

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: vi.fn(),
}))

const mockedRedis = ensureRedisConnected as unknown as ReturnType<typeof vi.fn>

function createRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.redirect = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn()
  return res
}

function storeFields(fields: Record<string, string>) {
  mockedRedis.mockResolvedValue({
    hGet: vi.fn(async (_key: string, field: string) => fields[field]),
  })
}

beforeEach(() => {
  mockedRedis.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/UIUC-api/navbarBranding', () => {
  it('405s on anything but GET', async () => {
    const res = createRes()
    await brandingHandler({ method: 'POST' } as any, res)

    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET')
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns the configured words and a versioned logo URL, without audit fields', async () => {
    storeFields({
      navbar_branding: JSON.stringify({
        primaryWord: 'OSC',
        secondaryWord: 'Chat',
        logoVersion: 'abc123',
        updatedAt: '2026-09-24T00:00:00.000Z',
        updatedBy: 'admin@illinois.edu',
      }),
    })

    const res = createRes()
    await brandingHandler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      branding: {
        primaryWord: 'OSC',
        secondaryWord: 'Chat',
        logoUrl: '/api/UIUC-api/navbarLogo?v=abc123',
      },
    })
  })

  it('returns the default brand when nothing is stored', async () => {
    storeFields({})

    const res = createRes()
    await brandingHandler({ method: 'GET' } as any, res)

    expect(res.json).toHaveBeenCalledWith({
      branding: { primaryWord: 'Illinois', secondaryWord: 'Chat', logoUrl: null },
    })
  })

  it('503s rather than reverting to the default brand when Redis is down', async () => {
    mockedRedis.mockRejectedValue(new Error('redis down'))

    const res = createRes()
    await brandingHandler({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(503)
  })
})

describe('GET /api/UIUC-api/navbarLogo', () => {
  const SVG_LOGO = 'data:image/svg+xml;base64,PHN2Zy8+'

  it('streams the stored image with its content type and a sandbox CSP', async () => {
    storeFields({ navbar_logo: SVG_LOGO })

    const res = createRes()
    await logoHandler(
      { method: 'GET', query: { v: logoVersionOf(SVG_LOGO) } } as any,
      res,
    )

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/svg+xml')
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining('sandbox'),
    )
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(String(res.send.mock.calls[0][0])).toBe('<svg/>')
  })

  it.each([
    ['a stale version', { v: 'stale' }],
    ['no version', {}],
  ])(
    'redirects %s to the current hash without caching',
    async (_label, query) => {
      storeFields({ navbar_logo: SVG_LOGO })

      const res = createRes()
      await logoHandler({ method: 'GET', query } as any, res)

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
      expect(res.redirect).toHaveBeenCalledWith(
        307,
        `/api/UIUC-api/navbarLogo?v=${logoVersionOf(SVG_LOGO)}`,
      )
      expect(res.send).not.toHaveBeenCalled()
    },
  )

  it('redirects to the built-in logo when none is uploaded', async () => {
    storeFields({ navbar_logo: '' })

    const res = createRes()
    await logoHandler({ method: 'GET', query: {} } as any, res)

    expect(res.redirect).toHaveBeenCalledWith(307, '/media/logo_illinois.png')
  })

  it('503s when Redis is down', async () => {
    mockedRedis.mockRejectedValue(new Error('redis down'))

    const res = createRes()
    await logoHandler({ method: 'GET', query: {} } as any, res)

    expect(res.status).toHaveBeenCalledWith(503)
  })
})
