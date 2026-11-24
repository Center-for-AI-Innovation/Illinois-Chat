import { describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => {
  return {
    routeModelRequest: vi.fn(async () => new Response('ok')),
    getModels: vi.fn(async () => ({
      OpenAICompatible: {
        enabled: true,
        baseUrl: 'https://stored.example/v1',
        apiKey: 'v1.stored.key',
        models: [],
      },
    })),
  }
})

vi.mock('~/pages/api/models', () => ({
  getModels: hoisted.getModels,
}))

vi.mock('~/app/api/authorization', () => ({
  withCourseAccessFromRequest: () => (h: any) => h,
}))

vi.mock('~/utils/streamProcessing', () => ({
  routeModelRequest: hoisted.routeModelRequest,
}))

import { POST } from '../queryRewrite/route'

describe('app/api/queryRewrite POST', () => {
  it('returns the underlying routeModelRequest response', async () => {
    hoisted.routeModelRequest.mockResolvedValueOnce(new Response('worked'))
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ any: 'body' }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toContain('worked')
  })

  it('routes with stored providers, not ones sent in the request', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        course_name: 'CS101',
        conversation: { id: 'c1', messages: [] },
        llmProviders: {
          OpenAICompatible: {
            enabled: true,
            baseUrl: 'https://attacker.example/v1',
            apiKey: '__stored_secret__',
            models: [{ id: 'x', enabled: true }],
          },
        },
      }),
    })
    ;(req as any).courseName = 'CS101'
    await POST(req as any)
    expect(hoisted.getModels).toHaveBeenCalledWith('CS101')
    const routedBody = (hoisted.routeModelRequest.mock.calls as any[][]).at(
      -1,
    )![0]
    expect(routedBody.llmProviders.OpenAICompatible.baseUrl).toBe(
      'https://stored.example/v1',
    )
    expect(routedBody.llmProviders.OpenAICompatible.apiKey).toBe(
      'v1.stored.key',
    )
  })

  it('returns 500 on errors', async () => {
    hoisted.routeModelRequest.mockRejectedValueOnce(new Error('boom'))
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ any: 'body' }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(500)
  })
})
