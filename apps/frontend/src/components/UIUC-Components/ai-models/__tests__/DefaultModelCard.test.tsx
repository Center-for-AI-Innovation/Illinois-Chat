import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  type AllLLMProviders,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import {
  isChatbotCocAcknowledged,
  markChatbotCocAcknowledged,
} from '~/utils/modelProviders/countriesOfConcern'
import { DefaultModelCard } from '../DefaultModelCard'

const providers = {
  [ProviderNames.OpenAI]: {
    provider: ProviderNames.OpenAI,
    enabled: true,
    models: [
      { id: 'gpt-a', name: 'GPT A', enabled: true, default: true },
      { id: 'gpt-off', name: 'GPT Off', enabled: false },
    ],
  },
  [ProviderNames.Anthropic]: {
    provider: ProviderNames.Anthropic,
    enabled: false,
    models: [{ id: 'claude-a', name: 'Claude A', enabled: true }],
  },
  [ProviderNames.WebLLM]: {
    provider: ProviderNames.WebLLM,
    enabled: true,
    models: [{ id: 'gemma', name: 'Gemma 2b', enabled: true }],
  },
} as unknown as AllLLMProviders

describe('DefaultModelCard', () => {
  it('shows the placeholder when no enabled model is the default', () => {
    const none = {
      [ProviderNames.OpenAI]: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: [{ id: 'gpt-a', name: 'GPT A', enabled: true }],
      },
    } as unknown as AllLLMProviders
    render(
      <DefaultModelCard
        projectName="CS101"
        llmProviders={none}
        onChange={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('combobox', { name: 'Default model' }),
    ).toHaveTextContent('Select a model')
  })

  it('shows the current default and offers only enabled models', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DefaultModelCard
        projectName="CS101"
        llmProviders={providers}
        onChange={onChange}
      />,
    )

    const trigger = screen.getByRole('combobox', { name: 'Default model' })
    expect(trigger).toHaveTextContent('GPT A')

    await user.click(trigger)
    expect(
      await screen.findByRole('option', { name: 'Gemma 2b' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'GPT Off' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Claude A' })).toBeNull()

    await user.click(screen.getByRole('option', { name: 'Gemma 2b' }))
    expect(onChange).toHaveBeenCalledWith({
      provider: ProviderNames.WebLLM,
      id: 'gemma',
    })
  })

  describe('country of concern', () => {
    const flagged = {
      [ProviderNames.OpenAI]: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: [
          { id: 'gpt-a', name: 'GPT A', enabled: true, default: true },
          { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek', enabled: true },
        ],
      },
    } as unknown as AllLLMProviders

    const pick = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('combobox', { name: 'Default model' }))
      await user.click(await screen.findByRole('option', { name: 'DeepSeek' }))
    }

    beforeEach(() => window.localStorage.clear())

    it('asks before making a flagged model the default, and sends nothing on dismiss', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <DefaultModelCard
          projectName="CS101"
          llmProviders={flagged}
          onChange={onChange}
        />,
      )
      await pick(user)

      expect(
        await screen.findByText('Default Model — Country of Concern Warning'),
      ).toBeInTheDocument()
      expect(onChange).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onChange).not.toHaveBeenCalled()
      expect(isChatbotCocAcknowledged('CS101')).toBe(false)
    })

    it('sets the default and remembers the acknowledgement on confirm', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <DefaultModelCard
          projectName="CS101"
          llmProviders={flagged}
          onChange={onChange}
        />,
      )
      await pick(user)
      await user.click(
        await screen.findByRole('button', { name: 'Set as default anyway' }),
      )

      expect(onChange).toHaveBeenCalledWith({
        provider: ProviderNames.OpenAI,
        id: 'deepseek/deepseek-v3.2',
      })
      expect(isChatbotCocAcknowledged('CS101')).toBe(true)
    })

    it('skips the prompt once the chatbot has acknowledged', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <DefaultModelCard
          projectName="CS101"
          llmProviders={flagged}
          onChange={onChange}
        />,
      )
      markChatbotCocAcknowledged('CS101')
      await pick(user)
      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })
})
