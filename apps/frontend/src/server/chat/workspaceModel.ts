import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createAzure } from '@ai-sdk/azure'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { type LanguageModel } from 'ai'
import { decryptKeyIfNeeded } from '~/utils/crypto'
import {
  type AllLLMProviders,
  type AzureProvider,
  type BedrockProvider,
} from '~/utils/modelProviders/LLMProvider'

export async function resolveWorkspaceModel(
  providers: AllLLMProviders,
  modelId: string,
): Promise<LanguageModel> {
  const provider = Object.values(providers).find(
    (p) => p?.enabled && p.models?.some((m) => m.enabled && m.id === modelId),
  )
  if (!provider)
    throw new Error(
      'This model is not enabled for this project. Choose another model.',
    )
  const key = provider.apiKey
    ? await decryptKeyIfNeeded(provider.apiKey)
    : undefined
  switch (provider.provider) {
    case 'OpenAI':
      return createOpenAI({ apiKey: key })(
        modelId === 'gpt-5-thinking' ? 'gpt-5' : modelId,
      )
    case 'Anthropic':
      return createAnthropic({ apiKey: key })(modelId.replace(/-thinking$/, ''))
    case 'Gemini':
      return createGoogle({ apiKey: key })(modelId)
    case 'Bedrock': {
      const bedrock = provider as BedrockProvider
      return createAmazonBedrock({
        region: bedrock.region,
        accessKeyId: await decryptKeyIfNeeded(bedrock.accessKeyId!),
        secretAccessKey: await decryptKeyIfNeeded(bedrock.secretAccessKey!),
      })(modelId)
    }
    case 'Azure': {
      const azure = provider as AzureProvider
      return createAzure({
        apiKey: key,
        baseURL: `${azure.AzureEndpoint?.replace(/\/$/, '')}/openai`,
        useDeploymentBasedUrls: true,
      }).chat(azure.AzureDeployment || modelId)
    }
    case 'Ollama':
    case 'NCSAHosted': {
      const baseURL = await decryptKeyIfNeeded(
        provider.baseUrl || process.env.OLLAMA_SERVER_URL || '',
      )
      return createOpenAICompatible({
        name: 'ollama',
        includeUsage: true,
        baseURL: `${baseURL.replace(/\/(?:api|v1)\/?$/, '').replace(/\/$/, '')}/v1`,
        apiKey: process.env.NCSA_HOSTED_API_KEY || 'ollama',
      })(modelId)
    }
    case 'NCSAHostedVLM':
      return createOpenAICompatible({
        name: 'vllm',
        includeUsage: true,
        baseURL: process.env.NCSA_HOSTED_VLM_BASE_URL!,
        apiKey: process.env.NCSA_HOSTED_API_KEY,
      })(modelId)
    case 'SambaNova':
      return createOpenAICompatible({
        name: 'sambanova',
        includeUsage: true,
        baseURL: 'https://api.sambanova.ai/v1',
        apiKey: key,
      })(modelId)
    case 'OpenAICompatible':
      return createOpenAICompatible({
        name: 'openaiCompatible',
        includeUsage: true,
        baseURL: provider.baseUrl!,
        apiKey: key,
      })(
        provider.baseUrl?.includes('openrouter.ai')
          ? modelId.toLowerCase()
          : modelId,
      )
    default:
      throw new Error(
        'This model runs locally in the browser. Select a hosted model for this workspace.',
      )
  }
}
