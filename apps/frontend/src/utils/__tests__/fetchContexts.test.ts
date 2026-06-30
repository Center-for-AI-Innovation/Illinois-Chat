import { describe, expect, it, vi } from 'vitest'
import { fetchContexts } from '../fetchContexts'

describe('fetchContexts (browser/jsdom)', () => {
  it('uses /api/getContexts on the client and returns data when ok', async () => {
    const data = [{ id: 1, text: 't' }] as any
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(data), { status: 200 }),
      )

    const result = await fetchContexts('CS101', 'query', 123, ['g1'], 'c1')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/getContexts'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual(data)
  })

  it('returns [] when /api/getContexts responds not ok', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 500 }),
    )

    await expect(fetchContexts('CS101', 'query')).resolves.toEqual([])
  })
})
