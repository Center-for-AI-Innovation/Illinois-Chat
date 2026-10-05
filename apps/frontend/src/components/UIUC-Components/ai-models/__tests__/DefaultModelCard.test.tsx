import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  type AllLLMProviders,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
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
  it('shows the current default and offers only enabled models', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DefaultModelCard llmProviders={providers} onChange={onChange} />)

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
})
