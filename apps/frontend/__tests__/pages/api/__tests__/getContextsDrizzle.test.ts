/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  vectorSearchWithDrizzle: vi.fn(),
  getDocGroupsForVectorSearch: vi.fn(async () => ({
    disabled_doc_groups: [],
    public_doc_groups: [],
  })),
}))

vi.mock('~/server/authorization', () => ({
  withCourseAccessFromRequest:
    () => (h: (req: any, res: any) => Promise<void>) =>
      h,
}))

vi.mock('~/db/vectorSearch', () => ({
  vectorSearchWithDrizzle: hoisted.vectorSearchWithDrizzle,
}))

vi.mock('~/db/dbHelpers', () => ({
  getDocGroupsForVectorSearch: hoisted.getDocGroupsForVectorSearch,
}))

import handler from '~/pages/api/getContextsDrizzle'

describe('getContextsDrizzle API', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res as any)
    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('returns 400 when queryEmbedding is not an array', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { course_name: 'CS101', queryEmbedding: 'not-array' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(hoisted.vectorSearchWithDrizzle).not.toHaveBeenCalled()
  })

  it('returns 400 when queryEmbedding is missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { course_name: 'CS101' },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error:
        'queryEmbedding (number[]) and course_name are required. Get queryEmbedding from your embedding API or backend.',
    })
    expect(hoisted.vectorSearchWithDrizzle).not.toHaveBeenCalled()
  })

  it('returns 400 when queryEmbedding is empty array', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { course_name: 'CS101', queryEmbedding: [] },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(hoisted.vectorSearchWithDrizzle).not.toHaveBeenCalled()
  })

  it('returns 400 when course_name is missing', async () => {
    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { queryEmbedding: [0.1, 0.2] },
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(hoisted.vectorSearchWithDrizzle).not.toHaveBeenCalled()
  })

  it('returns 200 with data from vectorSearchWithDrizzle', async () => {
    const data = [
      {
        id: '1',
        text: 'context one',
        metadata: { course_name: 'CS101' },
      },
    ]
    hoisted.vectorSearchWithDrizzle.mockResolvedValueOnce(data)
    hoisted.getDocGroupsForVectorSearch.mockResolvedValueOnce({
      disabled_doc_groups: ['g2'],
      public_doc_groups: [{ course_name: 'CS225', name: 'pub', enabled: true }],
    })

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          queryEmbedding: [0.1, 0.2, 0.3],
          course_name: 'CS225',
          doc_groups: ['g1'],
          conversation_id: 'conv-1',
          top_n: 50,
        },
      }) as any,
      res as any,
    )

    expect(hoisted.getDocGroupsForVectorSearch).toHaveBeenCalledWith('CS225')
    expect(hoisted.vectorSearchWithDrizzle).toHaveBeenCalledWith('CS225', {
      queryEmbedding: [0.1, 0.2, 0.3],
      course_name: 'CS225',
      doc_groups: ['g1'],
      disabled_doc_groups: ['g2'],
      public_doc_groups: [{ course_name: 'CS225', name: 'pub', enabled: true }],
      conversation_id: 'conv-1',
      top_n: 50,
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(data)
  })

  it('passes default doc_groups and top_n when omitted', async () => {
    hoisted.vectorSearchWithDrizzle.mockResolvedValueOnce([])

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          queryEmbedding: [0.1],
          course_name: 'CS101',
        },
      }) as any,
      res as any,
    )

    expect(hoisted.vectorSearchWithDrizzle).toHaveBeenCalledWith('CS101', {
      queryEmbedding: [0.1],
      course_name: 'CS101',
      doc_groups: [],
      disabled_doc_groups: [],
      public_doc_groups: [],
      conversation_id: undefined,
      top_n: 100,
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("ignores client-supplied disabled/public doc groups and uses the project's own (#312)", async () => {
    hoisted.vectorSearchWithDrizzle.mockResolvedValueOnce([])

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          queryEmbedding: [0.1],
          course_name: 'CS101',
          // A client naming another project's group must not widen the search.
          public_doc_groups: [
            { course_name: 'other-project', name: 'foreign', enabled: true },
          ],
          disabled_doc_groups: ['client-says-disabled'],
        },
      }) as any,
      res as any,
    )

    expect(hoisted.getDocGroupsForVectorSearch).toHaveBeenCalledWith('CS101')
    expect(hoisted.vectorSearchWithDrizzle).toHaveBeenCalledWith(
      'CS101',
      expect.objectContaining({
        public_doc_groups: [],
        disabled_doc_groups: [],
      }),
    )
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 500 when vectorSearchWithDrizzle throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    hoisted.vectorSearchWithDrizzle.mockRejectedValueOnce(new Error('db error'))

    const res = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: {
          queryEmbedding: [0.1],
          course_name: 'CS101',
        },
      }) as any,
      res as any,
    )

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error while fetching contexts via Drizzle',
      data: [],
    })
  })
})
