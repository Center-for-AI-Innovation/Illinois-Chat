import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  type LLMProvider,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import { AIModelsProviderCard } from '../AIModelsProviderCard'
import { CLOSED_SOURCE_PROVIDERS } from '../ai-models.providers'

const openAIConfig = CLOSED_SOURCE_PROVIDERS.find(
  (c) => c.key === ProviderNames.OpenAI,
)!
const compatibleConfig = CLOSED_SOURCE_PROVIDERS.find(
  (c) => c.key === ProviderNames.OpenAICompatible,
)!

const openAI = (overrides: Partial<LLMProvider> = {}) =>
  ({
    provider: ProviderNames.OpenAI,
    enabled: true,
    apiKey: '',
    models: [{ id: 'gpt-a', name: 'GPT A', enabled: true }],
    ...overrides,
  }) as LLMProvider

function deferred() {
  let resolve!: (v: boolean) => void
  const promise = new Promise<boolean>((r) => (resolve = r))
  return { promise, resolve }
}

function makeActions() {
  return {
    toggleProvider: vi.fn().mockResolvedValue(true),
    toggleModel: vi.fn().mockResolvedValue(true),
    saveProviderFields: vi.fn().mockResolvedValue(true),
  }
}

describe('AIModelsProviderCard', () => {
  it('never sends an unsaved key when the provider switch is flipped', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    render(
      <AIModelsProviderCard
        config={openAIConfig}
        provider={openAI()}
        projectName="CS101"
        actions={actions}
      />,
    )

    await user.type(screen.getByLabelText('OpenAI API Key'), 'sk-draft')
    await user.click(screen.getByRole('switch', { name: 'Enable OpenAI' }))

    expect(actions.toggleProvider).toHaveBeenCalledWith(
      ProviderNames.OpenAI,
      false,
    )
    expect(actions.saveProviderFields).not.toHaveBeenCalled()
    // The typed key stays a local draft until Save.
    expect(screen.getByLabelText('OpenAI API Key')).toHaveValue('sk-draft')
  })

  it('saves only edited fields, disables Save while saving, then clears the draft', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    const save = deferred()
    actions.saveProviderFields.mockReturnValue(save.promise)
    const { rerender } = render(
      <AIModelsProviderCard
        config={openAIConfig}
        provider={openAI()}
        projectName="CS101"
        actions={actions}
      />,
    )

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('OpenAI API Key'), 'sk-new')
    expect(button).toBeEnabled()

    await user.click(button)
    expect(actions.saveProviderFields).toHaveBeenCalledWith(
      ProviderNames.OpenAI,
      { apiKey: 'sk-new' },
    )
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(actions.saveProviderFields).toHaveBeenCalledTimes(1)

    save.resolve(true)
    rerender(
      <AIModelsProviderCard
        config={openAIConfig}
        provider={openAI({ apiKey: 'sk-new' })}
        projectName="CS101"
        actions={actions}
      />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(),
    )
    expect(screen.getByLabelText('OpenAI API Key')).toHaveValue('sk-new')
  })

  it('keeps the draft when the save fails', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    actions.saveProviderFields.mockResolvedValue(false)
    render(
      <AIModelsProviderCard
        config={openAIConfig}
        provider={openAI()}
        projectName="CS101"
        actions={actions}
      />,
    )

    await user.type(screen.getByLabelText('OpenAI API Key'), 'sk-bad')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    )
    expect(screen.getByLabelText('OpenAI API Key')).toHaveValue('sk-bad')
  })

  it('keeps one card saveable while another card is saving', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    actions.saveProviderFields.mockReturnValue(new Promise(() => {}))
    render(
      <>
        <AIModelsProviderCard
          config={openAIConfig}
          provider={openAI()}
          projectName="CS101"
          actions={actions}
        />
        <AIModelsProviderCard
          config={compatibleConfig}
          provider={
            {
              provider: ProviderNames.OpenAICompatible,
              enabled: true,
              baseUrl: '',
            } as LLMProvider
          }
          projectName="CS101"
          actions={actions}
        />
      </>,
    )

    const cardA = within(screen.getByRole('group', { name: 'OpenAI' }))
    const cardB = within(
      screen.getByRole('group', { name: 'OpenAI Compatible' }),
    )
    await user.type(cardA.getByLabelText('OpenAI API Key'), 'sk-a')
    await user.click(cardA.getByRole('button', { name: 'Save' }))
    await user.type(cardB.getByLabelText('API Key'), 'sk-b')

    expect(cardA.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(cardB.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('blocks saving an OpenAI-compatible base URL without /v1', async () => {
    const user = userEvent.setup()
    render(
      <AIModelsProviderCard
        config={compatibleConfig}
        provider={
          {
            provider: ProviderNames.OpenAICompatible,
            enabled: true,
            baseUrl: '',
          } as LLMProvider
        }
        projectName="CS101"
        actions={makeActions()}
      />,
    )

    const input = screen.getByLabelText('Base URL')
    await user.type(input, 'https://api.example.com')

    expect(input).toHaveAccessibleDescription('Base URL must include /v1')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.type(input, '/v1')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('shows the provider error and toggles models', async () => {
    const user = userEvent.setup()
    const actions = makeActions()
    render(
      <AIModelsProviderCard
        config={openAIConfig}
        provider={openAI({ error: 'fetch failed' })}
        projectName="CS101"
        actions={actions}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('fetch failed')
    await user.click(screen.getByRole('switch', { name: 'GPT A' }))
    expect(actions.toggleModel).toHaveBeenCalledWith(
      ProviderNames.OpenAI,
      'gpt-a',
      false,
    )
  })
})
