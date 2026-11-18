/* @vitest-environment node */

// Frozen-project recovery, exercised through the real course-metadata store and
// the real pages-router guard. Redis and Postgres are in-memory fakes, so each
// test can see exactly what was written and in what order.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  redis: new Map<string, string>(),
  events: [] as string[],
  upserts: [] as Array<{
    row: Record<string, unknown>
    set: Record<string, unknown>
  }>,
  auditInserts: [] as Array<Record<string, unknown>>,
  auditUpdates: [] as Array<Record<string, unknown>>,
  failures: {} as Partial<
    Record<'upsert' | 'hSet' | 'auditInsert' | 'auditUpdate', Error>
  >,
  currentUser: null as { email: string } | null,
  isSuperAdmin: false,
  // Written to Redis right after the next hGet returns (a racing editor).
  concurrentWriteAfterRead: null as null | { field: string; value: string },
  // The next compare-and-set applies, then throws as if the reply was lost.
  replyLostAfterApply: false,
  // The audit insert succeeds without returning a row.
  auditInsertReturnsNothing: false,
}))

vi.mock('~/utils/redisClient', () => {
  // One client for the whole test, so a test can queue responses on it.
  const client = {
    hGet: vi.fn(async (_hash: string, field: string) => {
      const value = state.redis.get(field) ?? undefined
      // A concurrent writer lands right after this read, as in a race.
      if (state.concurrentWriteAfterRead) {
        const write = state.concurrentWriteAfterRead
        state.concurrentWriteAfterRead = null
        state.redis.set(write.field, write.value)
      }
      return value
    }),
    hSet: vi.fn(async (_hash: string, obj: Record<string, string>) => {
      state.events.push('redis:hSet')
      if (state.failures.hSet) throw state.failures.hSet
      for (const [k, v] of Object.entries(obj)) state.redis.set(k, v)
    }),
    // Emulates the compare-and-set script: apply only if the field still holds
    // the expected value. ARGV[2] '1' means the field must be absent.
    eval: vi.fn(
      async (
        _script: string,
        opts: { keys: string[]; arguments: string[] },
      ) => {
        const [field, absentFlag, expected, next] = opts.arguments as [
          string,
          string,
          string,
          string,
        ]
        state.events.push('redis:cas')
        if (state.failures.hSet) throw state.failures.hSet
        const current = state.redis.get(field)
        const matches =
          absentFlag === '1' ? current === undefined : current === expected
        if (!matches) return 0
        state.redis.set(field, next)
        if (state.replyLostAfterApply) {
          state.replyLostAfterApply = false
          throw new Error('connection reset after the script ran')
        }
        return 1
      },
    ),
    // Two fields per page, so the cursor loop has to run more than once.
    hScan: vi.fn(async (_hash: string, cursor: number) => {
      const fields = [...state.redis.entries()]
      const page = fields.slice(cursor, cursor + 2)
      const next = cursor + 2 >= fields.length ? 0 : cursor + 2
      return {
        cursor: next,
        // node-redis 4 names this `tuples`, not `entries`.
        tuples: page.map(([field, value]) => ({ field, value })),
      }
    }),
  }
  return { ensureRedisConnected: vi.fn(async () => client) }
})

vi.mock('~/db/dbClient', async () => {
  const schema =
    await vi.importActual<typeof import('~/db/schema')>('~/db/schema')
  return {
    courseMetadata: schema.courseMetadata,
    projectConnectionAuditLog: schema.projectConnectionAuditLog,
    db: {
      insert: vi.fn(() => ({
        values: (row: Record<string, unknown>) => ({
          onConflictDoUpdate: async ({
            set,
          }: {
            set: Record<string, unknown>
          }) => {
            state.events.push('pg:upsert')
            if (state.failures.upsert) throw state.failures.upsert
            state.upserts.push({ row, set })
          },
          returning: async () => {
            state.events.push('audit:insert')
            if (state.failures.auditInsert) throw state.failures.auditInsert
            state.auditInserts.push(row)
            return state.auditInsertReturnsNothing ? [] : [{ id: 42 }]
          },
        }),
      })),
      update: vi.fn(() => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.events.push(`audit:${values.outcome}`)
            if (state.failures.auditUpdate) throw state.failures.auditUpdate
            state.auditUpdates.push(values)
          },
        }),
      })),
    },
  }
})

vi.mock('~/utils/superAdmins.server', () => ({
  isSuperAdminAsync: vi.fn(async () => state.isSuperAdmin),
}))

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: any) => async (req: any, res: any) => {
    if (!state.currentUser) {
      return res.status(401).json({ error: 'Missing token' })
    }
    req.user = state.currentUser
    return h(req, res)
  },
}))

const SUPER_ADMIN = { email: 'operator@example.com' }
const OWNER = { email: 'owner@example.com' }

// Every field a real record carries. The recovery must change only is_frozen.
const FROZEN_RECORD = {
  is_private: true,
  course_owner: 'owner@example.com',
  course_admins: ['ta@example.com'],
  approved_emails_list: ['student@example.com'],
  course_intro_message: 'Welcome to CS101',
  banner_image_s3: '',
  openai_api_key: 'sk-test-secret',
  example_questions: ['What is a hash?'],
  system_prompt: ['PROMPT TEXT'],
  disabled_models: [],
  project_description: 'Intro course',
  documentsOnly: false,
  disableCitations: false,
  guidedLearning: false,
  systemPromptOnly: false,
  vector_search_rewrite_disabled: false,
  agent_mode_enabled: false,
  allow_logged_in_users: false,
  tags: [],
  is_frozen: true,
}

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

async function loadHandler() {
  return (await import('~/pages/api/admin/frozenProjects')).default
}

function seed(name: string, record: Record<string, unknown>) {
  state.redis.set(name, JSON.stringify(record))
}

function storedRecord(name: string) {
  return JSON.parse(state.redis.get(name) ?? 'null') as Record<string, unknown>
}

beforeEach(() => {
  vi.resetModules()
  state.redis.clear()
  state.events.length = 0
  state.upserts.length = 0
  state.auditInserts.length = 0
  state.auditUpdates.length = 0
  state.failures = {}
  state.concurrentWriteAfterRead = null
  state.replyLostAfterApply = false
  state.auditInsertReturnsNothing = false
  state.currentUser = SUPER_ADMIN
  state.isSuperAdmin = true
})

describe('authorization', () => {
  it('rejects an unauthenticated GET with 401', async () => {
    state.currentUser = null
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )({ method: 'GET', headers: {} } as any, res)
    expect(res.statusCode).toBe(401)
    expect(state.events).toEqual([])
  })

  it('rejects an unauthenticated POST with 401 and changes nothing', async () => {
    state.currentUser = null
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    expect(res.statusCode).toBe(401)
    expect(state.events).toEqual([])
    expect(storedRecord('CS101').is_frozen).toBe(true)
  })

  it('refuses a non-super-admin GET without reading Redis', async () => {
    state.currentUser = OWNER
    state.isSuperAdmin = false
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )({ method: 'GET', headers: {} } as any, res)
    expect(res.statusCode).toBe(403)
    expect(res.body.projects).toBeUndefined()
  })

  it('refuses a non-super-admin POST and leaves the project frozen', async () => {
    state.currentUser = OWNER
    state.isSuperAdmin = false
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    expect(res.statusCode).toBe(403)
    expect(state.events).toEqual([])
    expect(storedRecord('CS101').is_frozen).toBe(true)
  })
})

describe('GET /api/admin/frozenProjects', () => {
  it('lists only frozen projects, sorted, with minimal fields', async () => {
    seed('Zeta', { ...FROZEN_RECORD, course_owner: 'z@example.com' })
    seed('Live', { ...FROZEN_RECORD, is_frozen: false })
    seed('Alpha', { ...FROZEN_RECORD, course_owner: 'a@example.com' })
    seed('Beta', { ...FROZEN_RECORD, is_private: false })
    const res = makeRes()
    await (
      await loadHandler()
    )({ method: 'GET', headers: {} } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.projects).toEqual([
      { course_name: 'Alpha', course_owner: 'a@example.com', is_private: true },
      {
        course_name: 'Beta',
        course_owner: 'owner@example.com',
        is_private: false,
      },
      { course_name: 'Zeta', course_owner: 'z@example.com', is_private: true },
    ])
  })

  it('never returns prompts, keys, or access lists', async () => {
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )({ method: 'GET', headers: {} } as any, res)

    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain('sk-test-secret')
    expect(serialized).not.toContain('PROMPT TEXT')
    expect(serialized).not.toContain('student@example.com')
    expect(serialized).not.toContain('ta@example.com')
    expect(Object.keys(res.body.projects[0]).sort()).toEqual([
      'course_name',
      'course_owner',
      'is_private',
    ])
  })

  it('returns an empty list when nothing is frozen', async () => {
    seed('CS101', { ...FROZEN_RECORD, is_frozen: false })
    const res = makeRes()
    await (
      await loadHandler()
    )({ method: 'GET', headers: {} } as any, res)
    expect(res.body).toEqual({ projects: [] })
  })

  it('returns 500 without leaking detail when Redis is unreachable', async () => {
    const { ensureRedisConnected } = await import('~/utils/redisClient')
    vi.mocked(ensureRedisConnected).mockRejectedValueOnce(
      new Error('ECONNREFUSED redis://secret-host'),
    )
    const res = makeRes()
    await (
      await loadHandler()
    )({ method: 'GET', headers: {} } as any, res)
    expect(res.statusCode).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('secret-host')
  })
})

describe('POST /api/admin/frozenProjects', () => {
  it('unfreezes the project and preserves every other field', async () => {
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ recovered: true, course_name: 'CS101' })
    expect(storedRecord('CS101')).toEqual({
      ...FROZEN_RECORD,
      is_frozen: false,
    })
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0]!.set.is_frozen).toBe(false)
  })

  it('writes the audit row before the change and finalizes it after', async () => {
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )

    expect(state.events).toEqual([
      'audit:insert',
      'pg:upsert',
      'redis:cas',
      'audit:success',
    ])
    expect(state.auditInserts[0]).toMatchObject({
      actor_email: SUPER_ADMIN.email,
      action: 'unfreeze',
      project_name: 'CS101',
      outcome: 'pending',
      changed_fields: ['is_frozen'],
    })
    expect(state.auditUpdates).toEqual([
      { outcome: 'success', failure_reason: null },
    ])
  })

  it('makes the recovered project pass ordinary owner routes again', async () => {
    seed('CS101', FROZEN_RECORD)
    const { withCourseOwnerOrAdminAccess } =
      await import('~/server/authorization')

    const ordinaryHandler = vi.fn(async (_req: any, res: any) =>
      res.status(200).json({ ok: true }),
    )
    const ordinary = withCourseOwnerOrAdminAccess()(ordinaryHandler)

    // Still frozen: the owner is refused by the ordinary route.
    state.currentUser = OWNER
    state.isSuperAdmin = false
    const before = makeRes()
    await ordinary(
      {
        method: 'POST',
        headers: {},
        query: { course_name: 'CS101' },
        body: {},
      } as any,
      before,
    )
    expect(before.statusCode).toBe(403)
    expect(before.body.error).toBe(
      'Project is temporarily frozen by the administrator',
    )
    expect(ordinaryHandler).not.toHaveBeenCalled()

    // Recovered: the same owner route now accepts the owner.
    state.currentUser = SUPER_ADMIN
    state.isSuperAdmin = true
    const recover = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      recover,
    )
    expect(recover.statusCode).toBe(200)

    state.currentUser = OWNER
    state.isSuperAdmin = false
    const after = makeRes()
    await ordinary(
      {
        method: 'POST',
        headers: {},
        query: { course_name: 'CS101' },
        body: {},
      } as any,
      after,
    )
    expect(after.statusCode).toBe(200)
    expect(ordinaryHandler).toHaveBeenCalledTimes(1)
  })

  it('keeps ordinary routes refusing a project the recovery did not touch', async () => {
    seed('CS101', FROZEN_RECORD)
    seed('Other', { ...FROZEN_RECORD, course_owner: 'x@example.com' })
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    expect(storedRecord('Other').is_frozen).toBe(true)
  })

  it('rejects a body without a course name', async () => {
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )({ method: 'POST', headers: {}, body: {} } as any, res)
    expect(res.statusCode).toBe(400)
    expect(state.events).toEqual([])
  })

  it('rejects a name with surrounding whitespace rather than guessing', async () => {
    seed('CS101', FROZEN_RECORD)
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: ' CS101 ' } } as any,
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(state.events).toEqual([])
  })

  it('returns 404 for a project that does not exist, with no audit row', async () => {
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'Missing' } } as any,
      res,
    )
    expect(res.statusCode).toBe(404)
    expect(state.events).toEqual([])
  })

  it('returns 409 for a project that is already unfrozen, with no writes', async () => {
    seed('CS101', { ...FROZEN_RECORD, is_frozen: false })
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    expect(res.statusCode).toBe(409)
    expect(state.events).toEqual([])
  })

  it('refuses to recover a record it cannot parse', async () => {
    state.redis.set('CS101', '{not json')
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    expect(res.statusCode).toBe(422)
    expect(state.events).toEqual([])
    expect(state.redis.get('CS101')).toBe('{not json')
  })

  it.each(['null', '[]', '7', '"text"'])(
    'refuses to recover a stored value of %s, with no writes or audit row',
    async (raw) => {
      state.redis.set('CS101', raw)
      const handler = await loadHandler()
      const res = makeRes()
      await handler(
        { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
        res,
      )
      expect(res.statusCode).toBe(422)
      expect(state.events).toEqual([])
      expect(state.redis.get('CS101')).toBe(raw)
    },
  )

  it('loses a race cleanly: the concurrent edit survives and recovery reports conflict', async () => {
    seed('CS101', FROZEN_RECORD)
    const concurrent = {
      ...FROZEN_RECORD,
      approved_emails_list: ['new@example.com'],
    }
    // A racing editor writes right after the route's initial read.
    state.concurrentWriteAfterRead = {
      field: 'CS101',
      value: JSON.stringify(concurrent),
    }
    const handler = await loadHandler()
    const res = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )

    expect(res.statusCode).toBe(409)
    // The concurrent edit is intact and the unfreeze did not apply over it.
    expect(storedRecord('CS101')).toEqual(concurrent)
    // Postgres follows the current Redis value, not the route's old snapshot.
    const lastUpsert = state.upserts[state.upserts.length - 1]!
    expect(lastUpsert.set.approved_emails_list).toEqual(['new@example.com'])
    expect(lastUpsert.set.is_frozen).toBe(true)
    expect(state.auditUpdates).toEqual([
      { outcome: 'failure', failure_reason: 'conflict' },
    ])
  })

  it('treats a lost Redis reply as applied when Redis did apply the write', async () => {
    seed('CS101', FROZEN_RECORD)
    state.replyLostAfterApply = true
    const handler = await loadHandler()
    const res = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(storedRecord('CS101').is_frozen).toBe(false)
    expect(state.auditUpdates).toEqual([
      { outcome: 'success', failure_reason: null },
    ])
  })
})

describe('recovery preserves the stored record', () => {
  it('changes only is_frozen: unknown legacy keys and an absent tags field survive', async () => {
    const source: Record<string, unknown> = { ...FROZEN_RECORD }
    delete source.tags
    source.legacy_settings = { theme: 'old', nested: [1, { a: null }] }
    source.legacy_flag = 0
    seed('CS101', source)

    const handler = await loadHandler()
    const res = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )

    expect(res.statusCode).toBe(200)
    const stored = storedRecord('CS101')
    expect(stored).toEqual({ ...source, is_frozen: false })
    expect('tags' in stored).toBe(false)
    expect(state.upserts[0].row.raw_metadata).toEqual(stored)
  })

  it('keeps existing tags exactly as stored, without normalizing them', async () => {
    seed('CS101', { ...FROZEN_RECORD, tags: ['  Raw  Tag ', 'Second'] })

    const handler = await loadHandler()
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { course_name: 'CS101' },
      } as any,
      makeRes(),
    )

    expect(storedRecord('CS101')).toEqual({
      ...FROZEN_RECORD,
      tags: ['  Raw  Tag ', 'Second'],
      is_frozen: false,
    })
    expect(state.upserts[0].row.raw_metadata).toEqual(storedRecord('CS101'))
  })
})

describe('malformed stored records', () => {
  it('lists frozen projects and skips records that are not JSON objects', async () => {
    seed('Good', FROZEN_RECORD)
    state.redis.set('Null', 'null')
    state.redis.set('Array', '[]')
    state.redis.set('Number', '7')
    state.redis.set('Text', '"hello"')

    const handler = await loadHandler()
    const res = makeRes()
    await handler({ method: 'GET', headers: {} } as any, res)

    expect(res.statusCode).toBe(200)
    expect(
      res.body.projects.map((p: { course_name: string }) => p.course_name),
    ).toEqual(['Good'])
  })
})

describe('remaining failure paths', () => {
  it('lists a frozen project with a wrong-typed owner or visibility using safe defaults', async () => {
    seed('Odd', { ...FROZEN_RECORD, course_owner: 42, is_private: 'yes' })
    const handler = await loadHandler()
    const res = makeRes()
    await handler({ method: 'GET', headers: {} } as any, res)

    expect(res.body.projects).toEqual([
      { course_name: 'Odd', course_owner: null, is_private: false },
    ])
  })

  it('refuses to unfreeze when the audit insert returns no row, and changes nothing', async () => {
    seed('CS101', FROZEN_RECORD)
    state.auditInsertReturnsNothing = true
    const handler = await loadHandler()
    const res = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )

    expect(res.statusCode).toBe(503)
    expect(state.events).toEqual(['audit:insert'])
    expect(storedRecord('CS101').is_frozen).toBe(true)
  })

  it('still reports the write failure when the audit row cannot be marked failed', async () => {
    seed('CS101', FROZEN_RECORD)
    state.failures.upsert = new Error('pg timeout')
    state.failures.auditUpdate = new Error('audit down')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = await loadHandler()
    const res = makeRes()
    await handler(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )

    // The caller still hears about the failed write, not a success.
    expect(res.statusCode).toBe(503)
    expect(res.body.error).toContain('Nothing was changed')
    expect(storedRecord('CS101').is_frozen).toBe(true)
    expect(consoleError).toHaveBeenCalledWith(
      '[frozenProjects] audit row could not be marked failed; it remains pending',
      { auditId: 42, courseName: 'CS101' },
      expect.any(Error),
    )
    consoleError.mockRestore()
  })
})

describe('response caching', () => {
  it('marks every response private and uncacheable, including 401 and 403', async () => {
    const handler = (await import('~/pages/api/admin/frozenProjects')).default

    state.currentUser = null
    const unauthenticated = makeRes()
    await handler({ method: 'GET', headers: {} } as any, unauthenticated)
    expect(unauthenticated.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    )

    state.currentUser = OWNER
    state.isSuperAdmin = false
    const forbidden = makeRes()
    await handler({ method: 'GET', headers: {} } as any, forbidden)
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    )
  })
})

describe('storage failures', () => {
  it('refuses to proceed when the audit row cannot be written', async () => {
    seed('CS101', FROZEN_RECORD)
    state.failures.auditInsert = new Error('db down')
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    expect(res.statusCode).toBe(503)
    expect(state.events).toEqual(['audit:insert'])
    expect(storedRecord('CS101').is_frozen).toBe(true)
  })

  it('leaves the project frozen when the Postgres write fails', async () => {
    seed('CS101', FROZEN_RECORD)
    state.failures.upsert = new Error('pg timeout')
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    expect(res.statusCode).toBe(503)
    expect(state.events).toEqual(['audit:insert', 'pg:upsert', 'audit:failure'])
    expect(storedRecord('CS101').is_frozen).toBe(true)
    expect(state.auditUpdates[0]).toEqual({
      outcome: 'failure',
      failure_reason: 'postgres',
    })
  })

  it('restores Postgres to the frozen state when the Redis write fails', async () => {
    seed('CS101', FROZEN_RECORD)
    state.failures.hSet = new Error('redis down')
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    expect(res.statusCode).toBe(503)
    expect(storedRecord('CS101').is_frozen).toBe(true)

    // The projection's last write is the rollback to the prior frozen state.
    const lastUpsert = state.upserts[state.upserts.length - 1]!
    expect(lastUpsert.set.is_frozen).toBe(true)
    expect(state.auditUpdates[0]).toEqual({
      outcome: 'failure',
      failure_reason: 'redis',
    })
  })

  it('reports the unfreeze as applied when the audit entry cannot be finalized', async () => {
    seed('CS101', FROZEN_RECORD)
    state.failures.auditUpdate = new Error('audit write failed')
    const res = makeRes()
    await (
      await loadHandler()
    )(
      { method: 'POST', headers: {}, body: { course_name: 'CS101' } } as any,
      res,
    )
    // Not a success: the audit trail is incomplete. Not a silent failure either:
    // the body says the change happened so the operator does not retry blindly.
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ recovered: true })
    expect(storedRecord('CS101').is_frozen).toBe(false)
  })
})
