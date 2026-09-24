/* @vitest-environment node */

// Every route added for the admin console, checked as a set rather than one at
// a time. A new route that forgets the guard is the failure this catches, so
// the list below should grow whenever one is added.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  isSuperAdminAsync: vi.fn(async (_email?: string | null) => false),
  currentUser: { email: 'stranger@example.com' } as { email: string } | null,
}))

vi.mock('~/utils/superAdmins.server', () => ({
  isSuperAdminAsync: hoisted.isSuperAdminAsync,
  readSuperAdminRoster: vi.fn(async () => ({
    envAdmins: [],
    grantedAdmins: [],
  })),
  addSuperAdminGrant: vi.fn(),
  removeSuperAdminGrant: vi.fn(),
}))

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: any) => async (req: any, res: any) => {
    if (!hoisted.currentUser) {
      return res.status(401).json({ error: 'User not authenticated' })
    }
    req.user = hoisted.currentUser
    return h(req, res)
  },
}))

// Stubbed so a guard failure surfaces as an unexpected 200 rather than as a
// database error that would pass a naive "not 200" assertion.
vi.mock('~/utils/platformSettings.server', () => ({
  readPlatformSettings: vi.fn(async () => ({
    settings: {
      announcementBanner: {
        enabled: false,
        message: '',
        linkText: '',
        linkUrl: '',
      },
      maintenance: { enabled: false, titleText: '', bodyText: '' },
    },
    bannerState: 'absent',
  })),
  writePlatformSettings: vi.fn(async () => ({ updatedAt: 'now' })),
}))

vi.mock('~/db/projectConnectionsRepo', () => ({
  listConnections: vi.fn(async () => []),
}))

function makeRes() {
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
  res.revalidate = vi.fn(async () => {})
  return res
}

const PROTECTED_ROUTES = [
  { name: 'GET /api/admin/settings', module: '~/pages/api/admin/settings', method: 'GET' },
  { name: 'PUT /api/admin/settings', module: '~/pages/api/admin/settings', method: 'PUT' },
  { name: 'GET /api/admin/superAdmins', module: '~/pages/api/admin/superAdmins', method: 'GET' },
  {
    name: 'POST /api/admin/superAdmins',
    module: '~/pages/api/admin/superAdmins',
    method: 'POST',
  },
  {
    name: 'DELETE /api/admin/superAdmins',
    module: '~/pages/api/admin/superAdmins',
    method: 'DELETE',
  },
  {
    name: 'GET /api/UIUC-api/projectConnections/list',
    module: '~/pages/api/UIUC-api/projectConnections/list',
    method: 'GET',
  },
] as const

beforeEach(() => {
  vi.resetModules()
  hoisted.isSuperAdminAsync.mockReset()
  hoisted.isSuperAdminAsync.mockResolvedValue(false)
  hoisted.currentUser = { email: 'stranger@example.com' }
})

afterEach(() => {
  hoisted.currentUser = { email: 'stranger@example.com' }
})

describe('admin route guards', () => {
  for (const route of PROTECTED_ROUTES) {
    it(`${route.name} returns 403 for a non-super-admin`, async () => {
      const mod = await import(route.module)
      const res = makeRes()
      await mod.default(
        { method: route.method, headers: {}, query: {}, body: {} } as any,
        res,
      )

      expect(res.statusCode).toBe(403)
    })

    it(`${route.name} returns 401 when unauthenticated`, async () => {
      hoisted.currentUser = null
      const mod = await import(route.module)
      const res = makeRes()
      await mod.default(
        { method: route.method, headers: {}, query: {}, body: {} } as any,
        res,
      )

      expect(res.statusCode).toBe(401)
    })
  }
})

describe('GET /api/admin/me', () => {
  it('answers false for a non-admin instead of 403', async () => {
    hoisted.isSuperAdminAsync.mockResolvedValue(false)
    const mod = await import('~/pages/api/admin/me')
    const res = makeRes()
    await mod.default({ method: 'GET', headers: {} } as any, res)

    // Client gating reads this endpoint, so a non-admin needs a usable answer.
    // A 403 here would be indistinguishable from a broken session.
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ isSuperAdmin: false })
  })

  it('answers true for an admin', async () => {
    hoisted.isSuperAdminAsync.mockResolvedValue(true)
    const mod = await import('~/pages/api/admin/me')
    const res = makeRes()
    await mod.default({ method: 'GET', headers: {} } as any, res)

    expect(res.body).toMatchObject({ isSuperAdmin: true })
  })

  it('still requires authentication', async () => {
    hoisted.currentUser = null
    const mod = await import('~/pages/api/admin/me')
    const res = makeRes()
    await mod.default({ method: 'GET', headers: {} } as any, res)

    expect(res.statusCode).toBe(401)
  })
})
