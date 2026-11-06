/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  readNlipConfig: vi.fn(),
  saveNlipConfig: vi.fn(),
}))

vi.mock('~/server/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (handler: any) => handler,
}))
vi.mock('~/server/nlip/config', () => ({
  readNlipConfig: hoisted.readNlipConfig,
  saveNlipConfig: hoisted.saveNlipConfig,
  publicNlipConfig: (config: any) => ({
    inboundEnabled: config.inboundEnabled,
    agents: config.agents.map(({ token, ...a }: any) => ({
      ...a,
      hasToken: Boolean(token),
    })),
  }),
}))

import { handler } from '~/pages/api/UIUC-api/tools/nlipAgents'

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
  return res
}

const req = (method: string, body?: unknown) =>
  ({ method, body, courseName: 'proj', user: {} }) as any

const AGENT = {
  id: 'b_bot',
  name: 'B',
  description: 'Ask B about its documents',
  project: 'B',
  enabled: true,
}
const STORED = {
  inboundEnabled: true,
  agents: [{ ...AGENT, token: { encrypted: 'ciphertext' } }],
}

beforeEach(() => {
  hoisted.readNlipConfig.mockResolvedValue(STORED)
  hoisted.saveNlipConfig.mockResolvedValue(STORED)
})

describe('nlipAgents route', () => {
  it('returns the config without stored tokens', async () => {
    const res = makeRes()
    await handler(req('GET'), res)
    expect(res.body).toEqual({
      inboundEnabled: true,
      agents: [{ ...AGENT, hasToken: true }],
    })
    expect(JSON.stringify(res.body)).not.toContain('ciphertext')
  })

  it('saves a valid config', async () => {
    const input = { inboundEnabled: true, agents: [{ ...AGENT, token: 't' }] }
    const res = makeRes()
    await handler(req('POST', input), res)
    expect(hoisted.saveNlipConfig).toHaveBeenCalledWith('proj', input)
    expect(res.body.agents[0].hasToken).toBe(true)
  })

  it('rejects an invalid config', async () => {
    const res = makeRes()
    await handler(
      req('POST', { inboundEnabled: true, agents: [AGENT, AGENT] }),
      res,
    )
    expect(res.statusCode).toBe(400)
    expect(hoisted.saveNlipConfig).not.toHaveBeenCalled()
  })

  it('returns 405 for other methods and 503 when storage fails', async () => {
    const del = makeRes()
    await handler(req('DELETE'), del)
    expect(del.statusCode).toBe(405)

    hoisted.readNlipConfig.mockRejectedValue(new Error('redis down'))
    const res = makeRes()
    await handler(req('GET'), res)
    expect(res.statusCode).toBe(503)
  })
})
