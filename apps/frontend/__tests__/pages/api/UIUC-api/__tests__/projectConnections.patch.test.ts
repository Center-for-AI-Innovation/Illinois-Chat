/* @vitest-environment node */

// PATCH is the risky verb on this route: it is the one that merges into an
// existing encrypted config. These cover the two ways a merge can silently
// destroy state — reactivating a disabled connection, and clobbering a secret
// that was rotated between read and write — plus the 404/400 boundaries.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MASTER_KEY = 'test-master-key-do-not-use-in-prod'

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

const auditEntries: any[] = []

/**
 * Stands in for `patchConnectionField`, running the handler's merge callback
 * against whatever the caller says is currently stored.
 *
 * `storedConfig` is what the row holds *at the moment the transaction takes
 * its lock* — which is the whole point of the real implementation re-reading
 * inside the transaction. Passing a rotated secret here reproduces a
 * concurrent rotation.
 */
async function mockRepo(options: {
  storedConfig?: Record<string, unknown> | null
  isActive?: boolean
  status?: 'ok' | 'row_not_found' | 'kind_not_configured'
}) {
  const { encryptProjectConfig } = await import('~/utils/crypto')
  const {
    storedConfig = null,
    isActive = true,
    status = 'ok',
  } = options
  const captured: { encrypted?: string } = {}

  vi.doMock('~/db/projectConnectionsRepo', () => ({
    getProjectIdByName: vi.fn(async () => 42),
    getConnectionByProject: vi.fn(async () => null),
    upsertConnectionField: vi.fn(async () => ({})),
    patchConnectionField: vi.fn(
      async (args: {
        merge: (current: { encrypted: string }) => Promise<{
          encrypted: string
        }>
      }) => {
        if (status !== 'ok') return { status }
        const current = storedConfig
          ? await encryptProjectConfig(storedConfig)
          : { encrypted: '' }
        const merged = await args.merge(current as { encrypted: string })
        captured.encrypted = merged.encrypted
        return {
          status: 'ok' as const,
          row: {
            project_name: 'demo',
            is_active: isActive,
          },
        }
      },
    ),
    deleteConnection: vi.fn(async () => ({
      deleted: true,
      found: true,
      cleared: null,
    })),
    setActive: vi.fn(async () => ({ found: true, is_active: isActive })),
    writeAuditEntry: vi.fn(async (entry: any) => {
      auditEntries.push(entry)
    }),
  }))
  return captured
}

function patchReq(body: unknown) {
  return {
    method: 'PATCH',
    headers: {},
    user: { email: 'admin@example.com' },
    body,
  } as any
}

beforeEach(() => {
  auditEntries.length = 0
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv('ENCRYPTION_MASTER_KEY', MASTER_KEY)
})

afterEach(() => {
  vi.doUnmock('~/db/projectConnectionsRepo')
  vi.doUnmock('~/utils/connectionManager')
})

describe('projectConnections PATCH', () => {
  it('leaves a disabled connection disabled', async () => {
    await mockRepo({
      storedConfig: {
        url: 'https://qdrant.example.edu',
        api_key: 'stored-key',
        port: 6333,
        default_collection: 'demo',
        apply_course_filter: true,
      },
      isActive: false,
    })

    const { handler } = await import('~/pages/api/UIUC-api/projectConnections')
    const res = makeRes()
    await handler(
      patchReq({
        project_name: 'demo',
        kind: 'qdrant',
        config: { apply_course_filter: false },
      }),
      res,
    )

    expect(res.statusCode).toBe(200)
    // The POST path hardcodes `is_active: true`; a toggle change must not go
    // anywhere near it.
    expect(res.body.is_active).toBe(false)
  })

  it('does not clobber a secret rotated after the config was last read', async () => {
    const captured = await mockRepo({
      storedConfig: {
        url: 'https://qdrant.example.edu',
        // The UI was loaded when the key was 'old-key'; by the time the patch
        // lands the row holds the rotated value.
        api_key: 'rotated-key',
        port: 6333,
        default_collection: 'demo',
      },
    })

    const { handler } = await import('~/pages/api/UIUC-api/projectConnections')
    const res = makeRes()
    await handler(
      patchReq({
        project_name: 'demo',
        kind: 'qdrant',
        config: { apply_course_filter: false },
      }),
      res,
    )
    expect(res.statusCode).toBe(200)

    const { decryptProjectConfig } = await import('~/utils/crypto')
    const written = await decryptProjectConfig<Record<string, unknown>>({
      encrypted: captured.encrypted as string,
    })
    expect(written?.api_key).toBe('rotated-key')
    expect(written?.apply_course_filter).toBe(false)
    expect(written?.default_collection).toBe('demo')
  })

  it('audits field names only, never values', async () => {
    await mockRepo({
      storedConfig: { connection_uri: 'postgresql://user:old@host:6543/db' },
    })

    const { handler } = await import('~/pages/api/UIUC-api/projectConnections')
    const res = makeRes()
    await handler(
      patchReq({
        project_name: 'demo',
        kind: 'database',
        config: {
          connection_uri: 'postgresql://user:brand-new-secret@host:6543/db',
        },
      }),
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(auditEntries[0]).toMatchObject({
      action: 'upsert',
      outcome: 'success',
      kind: 'database',
      changed_fields: ['connection_uri'],
    })
    expect(JSON.stringify(auditEntries[0])).not.toContain('brand-new-secret')
  })

  it('rejects a patch whose merged result is not a valid config', async () => {
    await mockRepo({
      storedConfig: { connection_uri: 'postgresql://user:pw@host:6543/db' },
    })

    const { handler } = await import('~/pages/api/UIUC-api/projectConnections')
    const res = makeRes()
    await handler(
      patchReq({
        project_name: 'demo',
        kind: 'database',
        config: { connection_uri: 'mysql://user:pw@host:3306/db' },
      }),
      res,
    )

    expect(res.statusCode).toBe(400)
  })

  it('404s when the project has no connections row', async () => {
    await mockRepo({ status: 'row_not_found' })

    const { handler } = await import('~/pages/api/UIUC-api/projectConnections')
    const res = makeRes()
    await handler(
      patchReq({
        project_name: 'demo',
        kind: 's3',
        config: { region: 'us-east-2' },
      }),
      res,
    )
    expect(res.statusCode).toBe(404)
  })

  it('404s when the row exists but this kind is not configured', async () => {
    await mockRepo({ status: 'kind_not_configured' })

    const { handler } = await import('~/pages/api/UIUC-api/projectConnections')
    const res = makeRes()
    await handler(
      patchReq({
        project_name: 'demo',
        kind: 's3',
        config: { region: 'us-east-2' },
      }),
      res,
    )
    expect(res.statusCode).toBe(404)
  })

  it('400s on an empty config', async () => {
    await mockRepo({ storedConfig: { region: 'us-east-1' } })

    const { handler } = await import('~/pages/api/UIUC-api/projectConnections')
    const res = makeRes()
    await handler(
      patchReq({ project_name: 'demo', kind: 's3', config: {} }),
      res,
    )
    expect(res.statusCode).toBe(400)
  })

  it('rejects a non-super-admin', async () => {
    await mockRepo({ storedConfig: { region: 'us-east-1' } })
    vi.doMock('~/utils/superAdmins.server', () => ({
      isSuperAdminAsync: vi.fn(async () => false),
    }))
    vi.doMock('~/utils/authMiddleware', () => ({
      withAuth: (h: any) => async (req: any, res: any) => {
        req.user = { email: 'stranger@example.com' }
        return h(req, res)
      },
    }))

    const mod = await import('~/pages/api/UIUC-api/projectConnections')
    const res = makeRes()
    await mod.default(
      {
        method: 'PATCH',
        headers: {},
        body: {
          project_name: 'demo',
          kind: 's3',
          config: { region: 'us-east-2' },
        },
      } as any,
      res,
    )
    expect(res.statusCode).toBe(403)

    vi.doUnmock('~/utils/superAdmins.server')
    vi.doUnmock('~/utils/authMiddleware')
  })
})
