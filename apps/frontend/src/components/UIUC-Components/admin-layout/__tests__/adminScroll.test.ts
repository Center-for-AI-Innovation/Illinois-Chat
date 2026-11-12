import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { trackActiveSection } from '../adminScroll'

// jsdom has no layout, so give the panel and headings fake geometry.
function setup() {
  document.body.innerHTML = `
    <main id="admin-panel-content">
      <h2 id="a">A</h2><h2 id="b">B</h2><h2 id="c">C</h2>
    </main>`
  const main = document.getElementById('admin-panel-content') as HTMLElement
  const tops: Record<string, number> = { a: 0, b: 400, c: 800 }
  const place = (scrollTop: number) => {
    Object.defineProperty(main, 'scrollTop', {
      value: scrollTop,
      configurable: true,
    })
    for (const [id, top] of Object.entries(tops)) {
      vi.spyOn(
        document.getElementById(id) as HTMLElement,
        'getBoundingClientRect',
      ).mockReturnValue({ top: top - scrollTop } as DOMRect)
    }
  }
  vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
    top: 0,
  } as DOMRect)
  Object.defineProperty(main, 'clientHeight', { value: 500 })
  Object.defineProperty(main, 'scrollHeight', { value: 1300 })
  place(0)
  const scrollTo = (y: number) => {
    place(y)
    main.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20) // one animation frame
  }
  return { main, scrollTo }
}

describe('trackActiveSection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('reports the last heading the reader has passed, only when it changes', () => {
    const { scrollTo } = setup()
    const onChange = vi.fn()
    const t = trackActiveSection(['a', 'b', 'c'], onChange)

    scrollTo(10)
    expect(onChange).toHaveBeenLastCalledWith('a')
    scrollTo(20) // still a: no extra call
    expect(onChange).toHaveBeenCalledTimes(1)
    scrollTo(350) // b is 50px below the top, inside the 96px line
    expect(onChange).toHaveBeenLastCalledWith('b')
    scrollTo(100)
    expect(onChange).toHaveBeenLastCalledWith('a')
    t.stop()
  })

  it('picks the last section at the bottom even if its heading never reaches the line', () => {
    const { scrollTo } = setup()
    const onChange = vi.fn()
    const t = trackActiveSection(['a', 'b', 'c'], onChange)

    scrollTo(800) // scrollTop + clientHeight = 1300 = scrollHeight
    expect(onChange).toHaveBeenLastCalledWith('c')
    t.stop()
  })

  it('does not report while held, then catches up', () => {
    const { scrollTo } = setup()
    const onChange = vi.fn()
    const t = trackActiveSection(['a', 'b', 'c'], onChange)

    t.hold(500)
    scrollTo(350)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(600)
    expect(onChange).toHaveBeenLastCalledWith('b')
    t.stop()
  })

  it('reacts to headings that appear after data loads', () => {
    const { main, scrollTo } = setup()
    const onChange = vi.fn()
    const t = trackActiveSection(['a', 'b', 'c'], onChange)
    scrollTo(350)
    onChange.mockClear()

    main.appendChild(document.createElement('div'))
    return Promise.resolve().then(() => {
      vi.advanceTimersByTime(20)
      expect(onChange).not.toHaveBeenCalled() // same answer, no spurious call
      t.stop()
    })
  })

  it('stops listening after stop()', () => {
    const { scrollTo } = setup()
    const onChange = vi.fn()
    const t = trackActiveSection(['a', 'b', 'c'], onChange)
    t.stop()
    scrollTo(350)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('is a no-op without the panel or sections', () => {
    document.body.innerHTML = ''
    const t = trackActiveSection(['a'], vi.fn())
    expect(() => {
      t.hold()
      t.stop()
    }).not.toThrow()
  })
})
