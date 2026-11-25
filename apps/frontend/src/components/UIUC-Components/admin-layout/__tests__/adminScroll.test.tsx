import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { readLocationHash, useScrollToHashWhenReady } from '../adminScroll'

describe('readLocationHash', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('returns the decoded hash so it matches section ids', () => {
    window.location.hash = '#mod%C3%A8les'
    expect(readLocationHash()).toBe('modèles')
  })

  it('falls back to the raw hash on a malformed escape', () => {
    window.location.hash = '#%E0'
    expect(readLocationHash()).toBe('%E0')
  })
})

describe('useScrollToHashWhenReady', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.location.hash = ''
  })

  const spy = () =>
    vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {})

  it('scrolls once to the hash heading when the page becomes ready', async () => {
    const scrollIntoView = spy()
    document.body.innerHTML = '<h2 id="open-source">Open Source</h2>'
    window.location.hash = '#open-source'

    const { rerender } = renderHook(
      ({ ready }) => useScrollToHashWhenReady(ready),
      { initialProps: { ready: false } },
    )
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender({ ready: true })
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(
      document.getElementById('open-source'),
    )

    rerender({ ready: false })
    rerender({ ready: true })
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('does not throw on a malformed hash escape', async () => {
    const scrollIntoView = spy()
    window.location.hash = '#%E0'

    expect(() => renderHook(() => useScrollToHashWhenReady(true))).not.toThrow()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does nothing without a hash', async () => {
    const scrollIntoView = spy()
    renderHook(() => useScrollToHashWhenReady(true))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
