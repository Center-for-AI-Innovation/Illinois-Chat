import { beforeEach, describe, expect, it, vi } from 'vitest'

let full: Record<string, unknown> = {}
const base = {
  course_owner: 'owner@illinois.edu',
  course_admins: ['admin@illinois.edu'],
  approved_emails_list: ['member@illinois.edu'],
  system_prompt: 'secret prompt',
  is_private: false,
}

let currentUser: { email: string } | undefined

vi.mock('~/utils/redisClient', () => ({
  ensureRedisConnected: async () => ({
    hGet: async () => JSON.stringify(full),
  }),
}))
vi.mock('~/utils/projectTimestamps', () => ({
  getProjectTimestamps: async () => ({}),
}))
vi.mock('~/db/dbClient', () => ({ db: {} }))
vi.mock('~/db/schema', () => ({ conversations: {} }))
vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: unknown) => h,
  getOptionalUser: async () => currentUser,
}))

import handler from '../getCourseMetadata'

function run(extra: Record<string, unknown> = {}) {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(c: number) {
      this.statusCode = c
      return this
    },
    json(b: unknown) {
      this.body = b
      return this
    },
  }
  const req: any = {
    query: { course_name: 'demo' },
    headers: {},
    cookies: {},
    ...extra,
  }
  return handler(req, res).then(() => res)
}

describe('GET getCourseMetadata redaction', () => {
  beforeEach(() => {
    currentUser = undefined
    full = { ...base }
  })

  it('hides the system prompt from anonymous callers on public projects', async () => {
    const res = await run()
    expect(res.statusCode).toBe(200)
    expect(res.body.course_metadata.system_prompt).toBeUndefined()
    expect(res.body.course_metadata.course_admins).toEqual([])
  })

  it('returns the full object to an owner on a public project', async () => {
    currentUser = { email: 'owner@illinois.edu' }
    const res = await run()
    expect(res.body.course_metadata.system_prompt).toBe('secret prompt')
    expect(res.body.course_metadata.course_admins).toEqual([
      'admin@illinois.edu',
    ])
  })

  it('keeps only the caller email for an approved user on a private project', async () => {
    full = { ...base, is_private: true }
    currentUser = { email: 'member@illinois.edu' }
    const res = await run({ user: currentUser })
    expect(res.body.course_metadata.system_prompt).toBeUndefined()
    expect(res.body.course_metadata.approved_emails_list).toEqual([
      'member@illinois.edu',
    ])
    expect(res.body.course_metadata.course_admins).toEqual([])
  })

  it('returns the full object to an admin on a private project', async () => {
    full = { ...base, is_private: true }
    currentUser = { email: 'admin@illinois.edu' }
    const res = await run({ user: currentUser })
    expect(res.body.course_metadata.system_prompt).toBe('secret prompt')
  })
})
