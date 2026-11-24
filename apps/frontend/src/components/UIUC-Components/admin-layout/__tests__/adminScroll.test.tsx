import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { useScrollToHashWhenReady } from '../adminScroll'

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

  it('does nothing without a hash', async () => {
    const scrollIntoView = spy()
    renderHook(() => useScrollToHashWhenReady(true))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
