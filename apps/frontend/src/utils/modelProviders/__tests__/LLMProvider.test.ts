import { describe, expect, it, beforeEach } from 'vitest'
import {
  ProviderNames,
  rememberUserModelChoice,
  selectBestModel,
  type AllLLMProviders,
} from '../LLMProvider'
import { OpenAIModelID, OpenAIModels } from '../types/openai'
import {
  CURRENT_NCSA_DEFAULT_MODEL_ID,
  NCSAHostedVLMModelID,
  NCSAHostedVLMModels,
} from '../types/NCSAHostedVLM'

function makeAllProviders(
  overrides: Partial<
    Record<ProviderNames, { enabled: boolean; models: any[] }>
  >,
): AllLLMProviders {
  const base: Record<string, any> = {}
  for (const provider of Object.values(ProviderNames)) {
    base[provider] = { provider, enabled: false, models: [] }
  }

  for (const [provider, value] of Object.entries(overrides)) {
    base[provider] = { ...base[provider], ...value }
  }

  return base as unknown as AllLLMProviders
}

const PROJECT = 'test-project'

function storePreference(
  projectName: string,
  modelId: string,
  projectDefaultId: string | null,
) {
  localStorage.setItem(
    `defaultModel:${projectName}`,
    JSON.stringify({ modelId, projectDefaultId }),
  )
}

function readStoredModelId(projectName: string): string | undefined {
  const raw = localStorage.getItem(`defaultModel:${projectName}`)
  return raw ? JSON.parse(raw).modelId : undefined
}

describe('selectBestModel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns the user-selected default model when available', () => {
    storePreference(PROJECT, OpenAIModelID.GPT_4o_mini, null)

    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [{ ...OpenAIModels[OpenAIModelID.GPT_4o_mini], enabled: true }],
      },
    })

    expect(selectBestModel(providers, PROJECT).id).toBe(
      OpenAIModelID.GPT_4o_mini,
    )
  })

  it('keeps the user pick when the project default is unchanged', () => {
    storePreference(PROJECT, OpenAIModelID.GPT_4o_mini, OpenAIModelID.GPT_4o)

    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [
          { ...OpenAIModels[OpenAIModelID.GPT_4o_mini], enabled: true },
          {
            ...OpenAIModels[OpenAIModelID.GPT_4o],
            enabled: true,
            default: true,
          },
        ],
      },
    })

    expect(selectBestModel(providers, PROJECT).id).toBe(
      OpenAIModelID.GPT_4o_mini,
    )
  })

  it('drops a stale user pick after the admin changes the project default', () => {
    // Pick made while GPT-4o was the project default; the admin has since moved
    // the default to GPT-4.1.
    storePreference(PROJECT, OpenAIModelID.GPT_4o_mini, OpenAIModelID.GPT_4o)

    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [
          { ...OpenAIModels[OpenAIModelID.GPT_4o_mini], enabled: true },
          { ...OpenAIModels[OpenAIModelID.GPT_4o], enabled: true },
          {
            ...OpenAIModels[OpenAIModelID.GPT_4_1],
            enabled: true,
            default: true,
          },
        ],
      },
    })

    expect(selectBestModel(providers, PROJECT).id).toBe(OpenAIModelID.GPT_4_1)
    expect(localStorage.getItem(`defaultModel:${PROJECT}`)).toBeNull()
  })

  it('does not leak a pick made in one project into another project', () => {
    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [
          { ...OpenAIModels[OpenAIModelID.GPT_4o_mini], enabled: true },
          {
            ...OpenAIModels[OpenAIModelID.GPT_4o],
            enabled: true,
            default: true,
          },
        ],
      },
    })

    rememberUserModelChoice(providers, 'project-a', OpenAIModelID.GPT_4o_mini)

    expect(selectBestModel(providers, 'project-a').id).toBe(
      OpenAIModelID.GPT_4o_mini,
    )
    expect(selectBestModel(providers, 'project-b').id).toBe(
      OpenAIModelID.GPT_4o,
    )
  })

  it('falls back to the project default when the stored preference is unreadable', () => {
    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [
          { ...OpenAIModels[OpenAIModelID.GPT_4o_mini], enabled: true },
          {
            ...OpenAIModels[OpenAIModelID.GPT_4o],
            enabled: true,
            default: true,
          },
        ],
      },
    })

    localStorage.setItem(`defaultModel:${PROJECT}`, 'not-json')
    expect(selectBestModel(providers, PROJECT).id).toBe(OpenAIModelID.GPT_4o)

    // A value of the right type but the wrong shape is ignored the same way.
    localStorage.setItem(`defaultModel:${PROJECT}`, JSON.stringify({}))
    expect(selectBestModel(providers, PROJECT).id).toBe(OpenAIModelID.GPT_4o)
  })

  it('falls back to the project default when no project name is available', () => {
    storePreference(PROJECT, OpenAIModelID.GPT_4o_mini, null)

    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [
          { ...OpenAIModels[OpenAIModelID.GPT_4o_mini], enabled: true },
          {
            ...OpenAIModels[OpenAIModelID.GPT_4o],
            enabled: true,
            default: true,
          },
        ],
      },
    })

    // With no project to scope it to, a pick is not remembered at all.
    rememberUserModelChoice(providers, undefined, OpenAIModelID.GPT_4o_mini)
    expect(localStorage.length).toBe(1)
    expect(selectBestModel(providers).id).toBe(OpenAIModelID.GPT_4o)
  })

  it('handles partial provider maps without crashing', () => {
    const partialProviders = {
      [ProviderNames.OpenAI]: {
        provider: ProviderNames.OpenAI,
        enabled: true,
        models: [{ ...OpenAIModels[OpenAIModelID.GPT_4o_mini], enabled: true }],
      },
    } as Partial<AllLLMProviders>

    expect(selectBestModel(partialProviders).id).toBe(OpenAIModelID.GPT_4o_mini)
  })

  it('migrates a legacy Qwen default only after Qwen 3.5 is available', () => {
    storePreference(PROJECT, NCSAHostedVLMModelID.QWEN2_5VL_32B_INSTRUCT, null)

    const providers = makeAllProviders({
      [ProviderNames.NCSAHostedVLM]: {
        enabled: true,
        models: [{ ...NCSAHostedVLMModels[NCSAHostedVLMModelID.QWEN3_5_27B] }],
      },
    })

    expect(selectBestModel(providers, PROJECT)).toEqual(
      NCSAHostedVLMModels[NCSAHostedVLMModelID.QWEN3_5_27B],
    )
    expect(readStoredModelId(PROJECT)).toBe(NCSAHostedVLMModelID.QWEN3_5_27B)
  })

  it('keeps the stored legacy Qwen default when Qwen 3.5 is unavailable', () => {
    storePreference(PROJECT, NCSAHostedVLMModelID.QWEN2_5VL_72B_INSTRUCT, null)

    const providers = makeAllProviders({
      [ProviderNames.NCSAHostedVLM]: {
        enabled: true,
        models: [
          {
            ...NCSAHostedVLMModels[NCSAHostedVLMModelID.QWEN2_5VL_72B_INSTRUCT],
          },
        ],
      },
    })

    expect(selectBestModel(providers, PROJECT)).toEqual(
      NCSAHostedVLMModels[NCSAHostedVLMModelID.QWEN2_5VL_72B_INSTRUCT],
    )
    expect(readStoredModelId(PROJECT)).toBe(
      NCSAHostedVLMModelID.QWEN2_5VL_72B_INSTRUCT,
    )
  })

  it('uses a global default model when no user default is set', () => {
    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [
          {
            ...OpenAIModels[OpenAIModelID.GPT_4o_mini],
            enabled: true,
            default: true,
          },
          { ...OpenAIModels[OpenAIModelID.GPT_4o], enabled: true },
        ],
      },
    })

    expect(selectBestModel(providers).id).toBe(OpenAIModelID.GPT_4o_mini)
  })

  it('falls back to the first preferred model when no defaults exist', () => {
    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [
          {
            ...OpenAIModels[OpenAIModelID.GPT_4o_mini],
            enabled: true,
            default: false,
          },
        ],
      },
    })

    expect(selectBestModel(providers).id).toBe(OpenAIModelID.GPT_4o_mini)
  })

  it('returns the first available enabled model when no defaults or preferred models match', () => {
    const customModel = {
      id: 'custom-openai',
      name: 'Custom OpenAI',
      enabled: true,
      tokenLimit: 4096,
    }

    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: {
        enabled: true,
        models: [customModel as any],
      },
    })

    expect(selectBestModel(providers)).toEqual(customModel)
  })

  it('rewrites the legacy NCSA default model in localStorage', () => {
    storePreference(PROJECT, NCSAHostedVLMModelID.QWEN2_5VL_72B_INSTRUCT, null)

    const providers = makeAllProviders({
      [ProviderNames.NCSAHostedVLM]: {
        enabled: true,
        models: [{ ...NCSAHostedVLMModels[NCSAHostedVLMModelID.QWEN3_5_27B] }],
      },
    })

    expect(selectBestModel(providers, PROJECT)).toEqual(
      NCSAHostedVLMModels[NCSAHostedVLMModelID.QWEN3_5_27B],
    )
    expect(readStoredModelId(PROJECT)).toBe(NCSAHostedVLMModelID.QWEN3_5_27B)
  })

  it('falls back to the current NCSA default descriptor when no models are available', () => {
    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: { enabled: false, models: [] },
      [ProviderNames.NCSAHostedVLM]: { enabled: false, models: [] },
    })

    expect(selectBestModel(providers)).toEqual(
      NCSAHostedVLMModels[CURRENT_NCSA_DEFAULT_MODEL_ID],
    )
  })

  it('falls back to an available legacy NCSA model before using the static default descriptor', () => {
    const providers = makeAllProviders({
      [ProviderNames.OpenAI]: { enabled: false, models: [] },
      [ProviderNames.NCSAHostedVLM]: {
        enabled: true,
        models: [
          {
            ...NCSAHostedVLMModels[NCSAHostedVLMModelID.QWEN2_5VL_32B_INSTRUCT],
            default: false,
          },
        ],
      },
    })

    expect(selectBestModel(providers)).toMatchObject(
      NCSAHostedVLMModels[NCSAHostedVLMModelID.QWEN2_5VL_32B_INSTRUCT],
    )
  })
})
