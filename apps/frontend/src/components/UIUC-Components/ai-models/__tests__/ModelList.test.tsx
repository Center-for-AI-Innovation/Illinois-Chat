import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  type AnySupportedModel,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import {
  isChatbotCocAcknowledged,
  markChatbotCocAcknowledged,
} from '~/utils/modelProviders/countriesOfConcern'
import { ModelList } from '../ModelList'

const models = [
  { id: 'gpt-a', name: 'GPT A', enabled: false },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek', enabled: false },
] as unknown as AnySupportedModel[]

function renderList(onToggle = vi.fn()) {
  render(
    <ModelList
      projectName="CS101"
      provider={ProviderNames.OpenAI}
      models={models}
      onToggle={onToggle}
    />,
  )
  return onToggle
}

describe('ModelList', () => {
  beforeEach(() => window.localStorage.clear())

  it('toggles an unflagged model straight away', async () => {
    const onToggle = renderList()
    await userEvent.setup().click(screen.getByRole('switch', { name: 'GPT A' }))
    expect(onToggle).toHaveBeenCalledWith(ProviderNames.OpenAI, 'gpt-a', true)
  })

  it('opens the warning for a flagged model and defers the toggle', async () => {
    const user = userEvent.setup()
    const onToggle = renderList()
    await user.click(screen.getByRole('switch', { name: 'DeepSeek' }))

    expect(
      await screen.findByText('Country of Concern Warning'),
    ).toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(isChatbotCocAcknowledged('CS101')).toBe(false)
  })

  it('enables the model and remembers the acknowledgement on confirm', async () => {
    const user = userEvent.setup()
    const onToggle = renderList()
    await user.click(screen.getByRole('switch', { name: 'DeepSeek' }))
    await user.click(
      await screen.findByRole('button', { name: 'Enable anyway' }),
    )

    expect(onToggle).toHaveBeenCalledWith(
      ProviderNames.OpenAI,
      'deepseek/deepseek-v3.2',
      true,
    )
    expect(isChatbotCocAcknowledged('CS101')).toBe(true)
  })

  it('does not prompt once acknowledged, nor when disabling', async () => {
    const user = userEvent.setup()
    markChatbotCocAcknowledged('CS101')
    const onToggle = renderList()
    await user.click(screen.getByRole('switch', { name: 'DeepSeek' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
