/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  return res
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.doUnmock('~/utils/superAdmins.server')
  vi.doUnmock('~/utils/superAdmins')
  vi.doUnmock('~/utils/authMiddleware')
})

function mockRoster(options: {
  envAdmins?: string[]
  grantedAdmins?: string[]
  warning?: string
  addSuperAdminGrant?: ReturnType<typeof vi.fn>
  removeSuperAdminGrant?: ReturnType<typeof vi.fn>
}) {
  const {
    envAdmins = [],
    grantedAdmins = [],
    warning,
    addSuperAdminGrant = vi.fn(async () => {}),
    removeSuperAdminGrant = vi.fn(async () => {}),
  } = options

  vi.doMock('~/utils/superAdmins.server', () => ({
    isSuperAdminAsync: vi.fn(async () => true),
    readSuperAdminRoster: vi.fn(async () => ({
      envAdmins,
      grantedAdmins,
      ...(warning ? { warning } : {}),
    })),
    addSuperAdminGrant,
    removeSuperAdminGrant,
  }))
  vi.doMock('~/utils/superAdmins', () => ({
    isSuperAdmin: (email: string) => envAdmins.includes(email.toLowerCase()),
    superAdmins: envAdmins,
  }))

  return { addSuperAdminGrant, removeSuperAdminGrant }
}

const actor = { email: 'admin@example.com' }

describe('/api/admin/superAdmins', () => {
  it('rejects a non-super-admin with 403', async () => {
    vi.doMock('~/utils/superAdmins.server', () => ({
      isSuperAdminAsync: vi.fn(async () => false),
      readSuperAdminRoster: vi.fn(),
      addSuperAdminGrant: vi.fn(),
      removeSuperAdminGrant: vi.fn(),
    }))
    vi.doMock('~/utils/authMiddleware', () => ({
      withAuth: (h: any) => async (req: any, res: any) => {
        req.user = { email: 'stranger@example.com' }
        return h(req, res)
      },
    }))

    const mod = await import('~/pages/api/admin/superAdmins')
    const res = makeRes()
    await mod.default({ method: 'GET', headers: {} } as any, res)
    expect(res.statusCode).toBe(403)
  })

  it('splits the roster by source', async () => {
    mockRoster({
      envAdmins: ['env@example.com'],
      grantedAdmins: ['granted@example.com'],
    })
    const { handler } = await import('~/pages/api/admin/superAdmins')
    const res = makeRes()
    await handler({ method: 'GET', headers: {}, user: actor } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      envAdmins: ['env@example.com'],
      grantedAdmins: ['granted@example.com'],
    })
  })

  it('refuses to remove an env-granted admin', async () => {
    const { removeSuperAdminGrant } = mockRoster({
      envAdmins: ['env@example.com'],
      grantedAdmins: [],
    })
    const { handler } = await import('~/pages/api/admin/superAdmins')
    const res = makeRes()
    await handler(
      {
        method: 'DELETE',
        headers: {},
        user: actor,
        query: { email: 'env@example.com' },
      } as any,
      res,
    )

    // The env allowlist is the recovery floor; pretending the UI can change it
    // would leave an operator believing access was revoked when it was not.
    expect(res.statusCode).toBe(400)
    expect(removeSuperAdminGrant).not.toHaveBeenCalled()
  })

  it('refuses to remove the last super admin', async () => {
    const { removeSuperAdminGrant } = mockRoster({
      envAdmins: [],
      grantedAdmins: ['only@example.com'],
    })
    const { handler } = await import('~/pages/api/admin/superAdmins')
    const res = makeRes()
    await handler(
      {
        method: 'DELETE',
        headers: {},
        user: actor,
        query: { email: 'only@example.com' },
      } as any,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toContain('last super admin')
    expect(removeSuperAdminGrant).not.toHaveBeenCalled()
  })

  it('removes a grant when another admin remains', async () => {
    const { removeSuperAdminGrant } = mockRoster({
      envAdmins: [],
      grantedAdmins: ['one@example.com', 'two@example.com'],
    })
    const { handler } = await import('~/pages/api/admin/superAdmins')
    const res = makeRes()
    await handler(
      {
        method: 'DELETE',
        headers: {},
        user: actor,
        query: { email: 'one@example.com' },
      } as any,
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(removeSuperAdminGrant).toHaveBeenCalledWith('one@example.com')
  })

  it('does not apply a removal it could not verify against the roster', async () => {
    const { removeSuperAdminGrant } = mockRoster({
      envAdmins: [],
      grantedAdmins: [],
      warning: 'Redis unreachable',
    })
    const { handler } = await import('~/pages/api/admin/superAdmins')
    const res = makeRes()
    await handler(
      {
        method: 'DELETE',
        headers: {},
        user: actor,
        query: { email: 'someone@example.com' },
      } as any,
      res,
    )

    expect(res.statusCode).toBe(503)
    expect(removeSuperAdminGrant).not.toHaveBeenCalled()
  })

  it('409s when the address is already an env admin', async () => {
    const { addSuperAdminGrant } = mockRoster({
      envAdmins: ['env@example.com'],
    })
    const { handler } = await import('~/pages/api/admin/superAdmins')
    const res = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        user: actor,
        body: { email: 'ENV@example.com' },
      } as any,
      res,
    )

    expect(res.statusCode).toBe(409)
    expect(addSuperAdminGrant).not.toHaveBeenCalled()
  })

  it('400s on a malformed email', async () => {
    const { addSuperAdminGrant } = mockRoster({})
    const { handler } = await import('~/pages/api/admin/superAdmins')
    const res = makeRes()
    await handler(
      {
        method: 'POST',
        headers: {},
        user: actor,
        body: { email: 'not-an-email' },
      } as any,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(addSuperAdminGrant).not.toHaveBeenCalled()
  })
})
