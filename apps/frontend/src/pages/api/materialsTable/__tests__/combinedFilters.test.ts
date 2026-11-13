import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const wheres: any[] = []

function makeChain(result: unknown) {
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(result)
        }
        if (prop === 'where') {
          return (w: unknown) => {
            wheres.push(w)
            return chain
          }
        }
        return () => chain
      },
    },
  )
  return chain
}

vi.mock('~/utils/connectionManager', () => ({
  connectionManager: {
    getDocumentsDb: vi.fn(async () => ({
      select: () => makeChain([{ count: 2 }]),
    })),
  },
}))
vi.mock('~/server/authorization', () => ({
  withCourseAccessFromRequest: () => (h: unknown) => h,
  withCourseOwnerOrAdminAccess: () => (h: unknown) => h,
}))
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }))
vi.mock('~/db/dbClient', async () => {
  const schema = await vi.importActual<any>('~/db/schema')
  return { documentsFailed: schema.documentsFailed }
})

import fetchProjectMaterials from '../fetchProjectMaterials'
import fetchFailedDocuments from '../fetchFailedDocuments'

const dialect = new PgDialect()
const render = (w: any) => dialect.sqlToQuery(w)

function mockRes() {
  const res: any = { statusCode: 0, body: undefined }
  res.status = (c: number) => {
    res.statusCode = c
    return res
  }
  res.json = (b: unknown) => {
    res.body = b
    return res
  }
  return res
}

const q = (params: Record<string, string>) => {
  const sp = new URLSearchParams({
    course_name: 'c1',
    from: '0',
    to: '9',
    ...params,
  })
  return {
    method: 'GET',
    query: Object.fromEntries(sp),
    url: `/api/x?${sp.toString()}`,
    headers: { host: 'localhost' },
  } as any
}

const TWO = JSON.stringify({ readable_filename: 'illinois', url: 'illinois.edu' })

beforeEach(() => {
  wheres.length = 0
})

describe.each([
  ['fetchProjectMaterials', fetchProjectMaterials as any, 'documents'],
  ['fetchFailedDocuments', fetchFailedDocuments as any, 'documents_failed'],
])('%s', (_name, handler, table) => {
  it('ANDs several filters in the list and the count', async () => {
    const res = mockRes()
    await handler(q({ filters: TWO }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.total_count).toBe(2)
    const list = render(wheres[0])
    expect(list.sql).toContain(`"${table}"."readable_filename" ILIKE $`)
    expect(list.sql).toContain(`"${table}"."url" ILIKE $`)
    expect(list.sql).toContain(' and ')
    expect(list.params).toEqual(['c1', '%illinois%', '%illinois.edu%'])
    // count query uses the identical conditions
    const count = render(wheres[1])
    expect(count).toEqual(list)
  })

  it('rejects columns outside the allowlist with 400', async () => {
    const res = mockRes()
    await handler(q({ filters: JSON.stringify({ s3_path: 'x' }) }), res)
    expect(res.statusCode).toBe(400)
    expect(wheres).toHaveLength(0)
  })

  it('rejects malformed filters with 400', async () => {
    const res = mockRes()
    await handler(q({ filters: 'not json' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('keeps legacy filter_key/filter_value working', async () => {
    const res = mockRes()
    await handler(q({ filter_key: 'url', filter_value: 'a.edu' }), res)
    expect(res.statusCode).toBe(200)
    const list = render(wheres[0])
    expect(list.params).toEqual(['c1', '%a.edu%'])
    expect(list.sql).toContain('ILIKE')
    expect(render(wheres[1])).toEqual(list)
  })

  it('filters only by course when nothing is given', async () => {
    const res = mockRes()
    await handler(q({}), res)
    expect(render(wheres[0]).params).toEqual(['c1'])
  })
})
