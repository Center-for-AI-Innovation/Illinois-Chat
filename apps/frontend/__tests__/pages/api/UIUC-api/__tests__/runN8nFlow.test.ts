/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => ({
  runN8nFlow: vi.fn(),
}))

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (fn: any) => fn,
}))

vi.mock('~/server/n8n/runFlow', () => ({
  runN8nFlow: hoisted.runN8nFlow,
}))

import handler, { runN8nFlowBackend } from '~/pages/api/UIUC-api/runN8nFlow'

describe('UIUC-api runN8nFlow', () => {
  beforeEach(() => {
    hoisted.runN8nFlow.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runN8nFlowBackend returns JSON response on success', async () => {
    hoisted.runN8nFlow.mockResolvedValueOnce({ ok: true })
    await expect(runN8nFlowBackend('k', 'n', { a: 1 })).resolves.toEqual({
      ok: true,
    })
  })

  it('runN8nFlowBackend throws an error message from the flow runner', async () => {
    hoisted.runN8nFlow.mockRejectedValueOnce(new Error('bad'))
    await expect(runN8nFlowBackend('k', 'n', { a: 1 })).rejects.toThrow('bad')
  })

  it('runN8nFlowBackend throws a timeout hint on AbortError', async () => {
    const error: any = new Error('aborted')
    error.name = 'AbortError'
    hoisted.runN8nFlow.mockRejectedValueOnce(error)
    await expect(runN8nFlowBackend('k', 'n', { a: 1 })).rejects.toThrow(
      'timed out',
    )
  })

  it('runN8nFlowBackend aborts immediately when the caller signal is already aborted', async () => {
    hoisted.runN8nFlow.mockImplementationOnce(async ({ signal }) => {
      if (signal?.aborted) {
        const error: any = new Error('aborted')
        error.name = 'AbortError'
        throw error
      }
      return { ok: true }
    })
    await expect(
      runN8nFlowBackend('k', 'n', { a: 1 }, AbortSignal.abort()),
    ).rejects.toThrow('timed out')
  })

  it('handler returns 405/400/200/408/500 for various cases', async () => {
    const res0 = createMockRes()
    await handler(createMockReq({ method: 'GET' }) as any, res0 as any)
    expect(res0.status).toHaveBeenCalledWith(405)

    const res1 = createMockRes()
    await handler(
      createMockReq({ method: 'POST', body: {} }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(400)

    hoisted.runN8nFlow.mockResolvedValueOnce({ result: true })
    const res2 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { api_key: 'k', name: 'n', data: { a: 1 } },
      }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(200)
    expect(res2.json).toHaveBeenCalledWith({ result: true })

    const timeout: any = new Error('aborted')
    timeout.name = 'AbortError'
    hoisted.runN8nFlow.mockRejectedValueOnce(timeout)
    const res3 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { api_key: 'k', name: 'n', data: { a: 1 } },
      }) as any,
      res3 as any,
    )
    expect(res3.status).toHaveBeenCalledWith(408)

    hoisted.runN8nFlow.mockRejectedValueOnce(new Error('boom'))
    const res4 = createMockRes()
    await handler(
      createMockReq({
        method: 'POST',
        body: { api_key: 'k', name: 'n', data: { a: 1 } },
      }) as any,
      res4 as any,
    )
    expect(res4.status).toHaveBeenCalledWith(500)
  })
})
