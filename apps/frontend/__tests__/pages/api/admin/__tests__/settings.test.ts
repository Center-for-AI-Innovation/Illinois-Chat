/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function makeRes(options: { revalidate?: () => Promise<void> } = {}) {
  const res: any = {}
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  res.setHeader = vi.fn()
  res.revalidate =
    options.revalidate ??
    vi.fn(async () => {
      res.revalidated = true
    })
  return res
}

const validSettings = {
  announcementBanner: {
    enabled: true,
    message: 'Scheduled maintenance Saturday.',
    linkText: 'Status page',
    linkUrl: 'https://status.illinois.edu',
  },
  maintenance: { enabled: false, titleText: '', bodyText: '' },
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.doUnmock('~/utils/platformSettings.server')
  vi.doUnmock('~/utils/superAdmins.server')
  vi.doUnmock('~/utils/authMiddleware')
})

function mockStore(overrides: Record<string, unknown> = {}) {
  vi.doMock('~/utils/platformSettings.server', () => ({
    readPlatformSettings: vi.fn(async () => ({
      settings: validSettings,
      bannerState: 'configured',
    })),
    writePlatformSettings: vi.fn(async () => ({
      updatedAt: '2026-09-08T00:00:00.000Z',
    })),
    ...overrides,
  }))
}

describe('GET|PUT /api/admin/settings', () => {
  it('rejects a non-super-admin with 403', async () => {
    mockStore()
    vi.doMock('~/utils/superAdmins.server', () => ({
      isSuperAdminAsync: vi.fn(async () => false),
    }))
    vi.doMock('~/utils/authMiddleware', () => ({
      withAuth: (h: any) => async (req: any, res: any) => {
        req.user = { email: 'stranger@example.com' }
        return h(req, res)
      },
    }))

    const mod = await import('~/pages/api/admin/settings')
    const res = makeRes()
    await mod.default({ method: 'GET', headers: {} } as any, res)
    expect(res.statusCode).toBe(403)
  })

  it('returns the stored snapshot on GET', async () => {
    mockStore()
    const { handler } = await import('~/pages/api/admin/settings')
    const res = makeRes()
    await handler(
      { method: 'GET', headers: {}, user: { email: 'a@example.com' } } as any,
      res,
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.settings.announcementBanner.message).toBe(
      'Scheduled maintenance Saturday.',
    )
  })

  it('reports saved and revalidated separately when revalidation throws', async () => {
    mockStore()
    const { handler } = await import('~/pages/api/admin/settings')
    const res = makeRes({
      revalidate: vi.fn(async () => {
        throw new Error('regeneration blew up')
      }),
    })

    await handler(
      {
        method: 'PUT',
        headers: {},
        user: { email: 'a@example.com' },
        body: validSettings,
      } as any,
      res,
    )

    // A failed page regeneration is not a failed write. Collapsing the two
    // would prompt an operator to retry a save that already landed.
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ saved: true, revalidated: false })
    expect(res.body.revalidationError).toContain('regeneration blew up')
  })

  it('rejects an http:// banner link before writing anything', async () => {
    const writePlatformSettings = vi.fn()
    mockStore({ writePlatformSettings })

    const { handler } = await import('~/pages/api/admin/settings')
    const res = makeRes()
    await handler(
      {
        method: 'PUT',
        headers: {},
        user: { email: 'a@example.com' },
        body: {
          ...validSettings,
          announcementBanner: {
            ...validSettings.announcementBanner,
            linkUrl: 'http://insecure.example.edu',
          },
        },
      } as any,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(writePlatformSettings).not.toHaveBeenCalled()
  })

  it('returns 503 when the settings store is unreachable', async () => {
    mockStore({
      writePlatformSettings: vi.fn(async () => {
        throw new Error('redis down')
      }),
    })

    const { handler } = await import('~/pages/api/admin/settings')
    const res = makeRes()
    await handler(
      {
        method: 'PUT',
        headers: {},
        user: { email: 'a@example.com' },
        body: validSettings,
      } as any,
      res,
    )

    expect(res.statusCode).toBe(503)
    expect(res.body.saved).toBe(false)
  })
})
