import { type ReactNode } from 'react'

import {
  type BedrockProvider,
  type LLMProvider,
  ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import { type ProviderFieldValues } from './useAIModelsSettings'

export interface ProviderFieldConfig {
  name: keyof ProviderFieldValues
  label: string
  placeholder?: string
  secret?: boolean
  /** Returns an error message, or undefined when the value is valid. */
  validate?: (value: string) => string | undefined
}

export interface ProviderConfig {
  key: ProviderNames
  name: string
  externalUrl?: string
  description?: ReactNode
  fields?: ProviderFieldConfig[]
  /** Defaults to "the provider has models". */
  showModels?: (provider: LLMProvider) => boolean
}

const apiKey = (label: string): ProviderFieldConfig => ({
  name: 'apiKey',
  label,
  secret: true,
})

export const OPEN_SOURCE_PROVIDERS: ProviderConfig[] = [
  {
    key: ProviderNames.NCSAHosted,
    name: 'NCSA Hosted LLMs',
    externalUrl: 'https://ai.ncsa.illinois.edu/',
    description:
      "These models are hosted by the Center for AI Innovation at the National Center for Supercomputing Applications. They're free.",
  },
  {
    key: ProviderNames.NCSAHostedVLM,
    name: 'NCSA Hosted VLMs',
    externalUrl: 'https://ai.ncsa.illinois.edu/',
    description:
      'Vision Language Models hosted by NCSA. These models can understand and analyze images in addition to text. Free for UIUC students.',
  },
  {
    key: ProviderNames.Ollama,
    name: 'Ollama',
    externalUrl: 'https://ollama.ai/',
    description: (
      <>
        Ollama allows you to easily self-host LLMs. Set up Ollama on your
        machine and provide the base URL. Note that only the following models
        are supported, email us if you&apos;d like any others:{' '}
        <code>llama3.1:8b</code>, <code>llama3.1:70b</code>,{' '}
        <code>llama3.1:405b</code>.
      </>
    ),
    fields: [
      {
        name: 'baseUrl',
        label: 'Base URL',
        placeholder: 'http://your-domain.com',
      },
    ],
  },
  {
    key: ProviderNames.WebLLM,
    name: 'WebLLM',
    externalUrl: 'https://github.com/mlc-ai/web-llm',
    description:
      'WebLLM is a framework for building and deploying LLMs in the browser.',
  },
]

export const CLOSED_SOURCE_PROVIDERS: ProviderConfig[] = [
  {
    key: ProviderNames.Anthropic,
    name: 'Anthropic',
    externalUrl: 'https://console.anthropic.com/settings/keys',
    fields: [apiKey('Anthropic API Key')],
  },
  {
    key: ProviderNames.OpenAI,
    name: 'OpenAI',
    externalUrl: 'https://platform.openai.com/account/api-keys',
    fields: [apiKey('OpenAI API Key')],
  },
  {
    key: ProviderNames.OpenAICompatible,
    name: 'OpenAI Compatible',
    fields: [
      {
        name: 'baseUrl',
        label: 'Base URL',
        placeholder: 'https://api.example.com/v1',
        validate: (value) =>
          value && !value.includes('/v1')
            ? 'Base URL must include /v1'
            : undefined,
      },
      apiKey('API Key'),
    ],
  },
  {
    key: ProviderNames.Azure,
    name: 'Azure OpenAI',
    externalUrl:
      'https://azure.microsoft.com/en-us/products/cognitive-services/openai-service/',
    fields: [
      apiKey('Azure API Key'),
      {
        name: 'AzureEndpoint',
        label: 'Azure Endpoint',
        placeholder: 'https://your-resource-name.openai.azure.com/',
      },
    ],
  },
  {
    key: ProviderNames.Bedrock,
    name: 'Amazon Bedrock',
    externalUrl: 'https://aws.amazon.com/bedrock/',
    fields: [
      { name: 'accessKeyId', label: 'AWS Access Key ID', secret: true },
      { name: 'secretAccessKey', label: 'AWS Secret Access Key', secret: true },
      { name: 'region', label: 'AWS Region', placeholder: 'us-east-1' },
    ],
    // Bedrock only lists models once its saved credentials are complete.
    showModels: (provider) => {
      const { accessKeyId, secretAccessKey, region } =
        provider as BedrockProvider
      return Boolean(accessKeyId && secretAccessKey && region)
    },
  },
  {
    key: ProviderNames.Gemini,
    name: 'Google Gemini',
    externalUrl: 'https://ai.google.dev/',
    fields: [apiKey('Google API Key')],
  },
  {
    key: ProviderNames.SambaNova,
    name: 'SambaNova',
    externalUrl: 'https://sambanova.ai/api',
    fields: [apiKey('SambaNova API Key')],
  },
]
