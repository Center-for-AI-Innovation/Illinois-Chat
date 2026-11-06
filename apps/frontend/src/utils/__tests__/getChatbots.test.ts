import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'

const calls: { where?: SQL; orderBy?: SQL; limit?: number; offset?: number } =
  {}
let rows: unknown[] = []
let countRows: unknown[] = []

vi.mock('~/db/dbClient', async () => {
  const schema = await import('~/db/schema')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const builder = drizzle.mock()
  const db = {
    select: (fields: Record<string, unknown>) => {
      // Subqueries are only rendered, never run, so build them for real.
      if (!('course_name' in fields) && !('n' in fields)) {
        return builder.select(fields as never)
      }
      const isCount = 'n' in fields
      const chain = {
        from: () => chain,
        where: (w: SQL) => {
          calls.where = w
          return isCount ? Promise.resolve(countRows) : chain
        },
        orderBy: (...o: SQL[]) => {
          calls.orderBy = sql.join(o, sql`, `)
          return chain
        },
        limit: (l: number) => {
          calls.limit = l
          return chain
        },
        offset: (o: number) => {
          calls.offset = o
          return Promise.resolve(rows)
        },
      }
      return chain
    },
  }
  return { ...schema, db }
})

import { getChatbots, parsePageParams } from '../getChatbots'

const dialect = new PgDialect()
const render = (q?: SQL) =>
  q ? dialect.sqlToQuery(q) : { sql: '', params: [] }

const row = (course_name: string, total: number) => ({
  course_name,
  raw_metadata: {
    course_owner: 'owner@x.edu',
    course_admins: [],
    is_private: false,
  },
  created_at: new Date('2026-01-02T03:04:05Z'),
  total,
})

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k as keyof typeof calls]
  rows = []
  countRows = []
})

describe('parsePageParams', () => {
  it('defaults to the first page, newest first', () => {
    expect(parsePageParams({})).toEqual({
      params: { offset: 0, limit: 5, sortBy: 'created_at', sortDir: 'desc' },
    })
  })

  it('accepts valid values', () => {
    expect(
      parsePageParams({
        offset: '10',
        limit: '50',
        sortBy: 'name',
        sortDir: 'asc',
      }),
    ).toEqual({
      params: { offset: 10, limit: 50, sortBy: 'name', sortDir: 'asc' },
    })
  })

  it.each([
    [{ offset: '-1' }],
    [{ offset: 'abc' }],
    [{ limit: '0' }],
    [{ limit: '51' }],
    [{ limit: ['5', '6'] }],
    [{ sortBy: 'owner' }],
    [{ sortDir: 'up' }],
  ])('rejects %o', (query) => {
    expect(parsePageParams(query)).toHaveProperty('error')
  })
})

describe('getChatbots', () => {
  it('owned: matches owner or admin, no access predicate', async () => {
    await getChatbots({ userEmail: 'me@x.edu', user: 'owned' })
    const { sql, params } = render(calls.where)
    expect(sql).toContain('"course_metadata"."is_frozen" = $')
    expect(params).toContain(false)
    expect(sql).toContain('"course_metadata"."course_owner" = $')
    expect(sql).toContain('"course_metadata"."course_admins" @> $')
    expect(sql).not.toContain('approved_emails_list')
    expect(params).toContain('me@x.edu')
  })

  it('others: requires access and excludes owned bots', async () => {
    await getChatbots({ userEmail: 'me@x.edu', user: 'others' })
    const { sql } = render(calls.where)
    expect(sql).toContain('approved_emails_list')
    expect(sql).toContain('allow_logged_in_users')
    expect(sql).toMatch(/and not \(/i)
  })

  it('applies visibility, type and excludeTypes', async () => {
    await getChatbots({
      userEmail: 'me@x.edu',
      user: 'others',
      visibility: 'private',
      excludeTypes: ['Course', 'Department'],
    })
    const { sql, params } = render(calls.where)
    expect(sql).toContain('"course_metadata"."is_private" = $')
    expect(params).toContain(true)
    expect(sql).toMatch(/COALESCE\([\s\S]*, ''\) not in \(\$\d+, \$\d+\)/i)
    expect(params).toEqual(expect.arrayContaining(['Course', 'Department']))

    await getChatbots({ userEmail: 'me@x.edu', user: 'others', type: 'Course' })
    expect(render(calls.where).params).toContain('Course')
    expect(render(calls.where).sql).not.toMatch(/not in/i)
  })

  it('defaults to created_at desc with a course_name tiebreaker', async () => {
    await getChatbots({ userEmail: 'me@x.edu', user: 'owned' })
    const { sql } = render(calls.orderBy)
    expect(sql).toMatch(/min\("created_at"\)[\s\S]*desc NULLS LAST/)
    // Correlated on the outer row, not a self-match inside projects.
    expect(sql).toContain(
      '"projects"."course_name" = "course_metadata"."course_name"',
    )
    expect(sql).toMatch(/"course_metadata"\."course_name" asc$/i)
    expect(calls).toMatchObject({ limit: 5, offset: 0 })
  })

  it('sorts by name ascending when asked', async () => {
    await getChatbots({
      userEmail: 'me@x.edu',
      user: 'owned',
      sortBy: 'name',
      sortDir: 'asc',
      offset: 10,
      limit: 3,
    })
    expect(render(calls.orderBy).sql).toMatch(
      /^LOWER\("course_metadata"\."course_name"\) asc, /i,
    )
    expect(calls).toMatchObject({ limit: 3, offset: 10 })
  })

  it('returns cards with created_at and the window total', async () => {
    rows = [row('cs101', 12), row('cs102', 12)]
    const data = await getChatbots({ userEmail: 'me@x.edu', user: 'others' })
    expect(data.total).toBe(12)
    expect(data.results.map((c) => c.course_name)).toEqual(['cs101', 'cs102'])
    expect(data.results[0]?.created_at).toBe('2026-01-02T03:04:05.000Z')
  })

  it('counts separately when the page is past the end', async () => {
    countRows = [{ n: 7 }]
    const data = await getChatbots({
      userEmail: 'me@x.edu',
      user: 'others',
      offset: 20,
    })
    expect(data).toEqual({ results: [], total: 7 })
  })
})
