import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

import { AIModelsContent } from '../AIModelsContent'
import { type AIModelsSettings } from '../useAIModelsSettings'

const settingsWith = (isLoading: boolean) =>
  ({ llmProviders: undefined, isLoading, isError: false }) as AIModelsSettings

describe('AIModelsContent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.location.hash = ''
  })

  it('scrolls once to the URL hash heading, after the data has loaded', async () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    window.location.hash = '#open-source'

    const { rerender } = render(
      <AIModelsContent projectName="CS101" settings={settingsWith(true)} />,
    )
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender(
      <AIModelsContent projectName="CS101" settings={settingsWith(false)} />,
    )
    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(scrollIntoView.mock.contexts[0]).toBe(
      document.getElementById('open-source'),
    )
  })
})
