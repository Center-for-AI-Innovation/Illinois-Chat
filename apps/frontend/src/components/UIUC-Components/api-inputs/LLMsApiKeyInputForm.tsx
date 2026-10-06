import { Button } from '@/components/shadcn/ui/button'
import { Card } from '@/components/shadcn/ui/card'
import { Input } from '@/components/shadcn/ui/input'
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/shadcn/ui/combobox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import {
  IconAlertTriangleFilled,
  IconChevronDown,
  IconX,
} from '@tabler/icons-react'
import {
  type CountryOfConcern,
  getCountryOfConcern,
  getCountryOfConcernLongMessage,
  getCountryOfConcernShortMessage,
  isChatbotCocAcknowledged,
  markChatbotCocAcknowledged,
} from '~/utils/modelProviders/countriesOfConcern'
import { useForm, type FieldApi } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import Head from 'next/head'
import Image from 'next/image'
import React, { useEffect, useState } from 'react'
import { getModelLogo } from '~/components/Chat/ModelSelect'
import SettingsLayout, {
  getInitialCollapsedState,
} from '~/components/Layout/SettingsLayout'
import { useUpdateProjectLLMProviders } from '@/hooks/queries/useUpdateProjectLLMProviders'
import { useFetchLLMProviders } from '@/hooks/queries/useFetchLLMProviders'
import {
  LLM_PROVIDER_ORDER,
  type AllLLMProviders,
  type AnthropicProvider,
  type AnySupportedModel,
  type AzureProvider,
  type BedrockProvider,
  type GeminiProvider,
  type LLMProvider,
  type NCSAHostedProvider,
  type NCSAHostedVLMProvider,
  type OllamaProvider,
  type OpenAIProvider,
  type OpenAICompatibleProvider,
  type ProviderNames,
  type SambaNovaProvider,
  type WebLLMProvider,
} from '~/utils/modelProviders/LLMProvider'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import { showToast } from '~/utils/toastUtils'
import { Skeleton } from '@/components/shadcn/ui/skeleton'
import { GetCurrentPageName } from '../CanViewOnlyCourse'
import { CountryOfConcernModal } from './CountryOfConcernModal'
import GlobalFooter from '../GlobalFooter'
import AnthropicProviderInput from './providers/AnthropicProviderInput'
import AzureProviderInput from './providers/AzureProviderInput'
import BedrockProviderInput from './providers/BedrockProviderInput'
import GeminiProviderInput from './providers/GeminiProviderInput'
import NCSAHostedLLmsProviderInput from './providers/NCSAHostedProviderInput'
import NCSAHostedVLMProviderInput from './providers/NCSAHostedVLMProviderInput'
import OllamaProviderInput from './providers/OllamaProviderInput'
import OpenAIProviderInput from './providers/OpenAIProviderInput'
import OpenAICompatibleProviderInput from './providers/OpenAICompatibleProviderInput'
import SambaNovaProviderInput from './providers/SambaNovaProviderInput'
import WebLLMProviderInput from './providers/WebLLMProviderInput'

const isSmallScreen = false

function FieldInfo({ field }: { field: FieldApi<any, any, any, any> }) {
  return (
    <>
      {field.state.meta.isTouched && field.state.meta.errors.length ? (
        <p className="text-xs text-red-500">
          {field.state.meta.errors.join(', ')}
        </p>
      ) : null}
      {field.state.meta.isValidating ? (
        <p className="text-xs">Validating...</p>
      ) : null}
    </>
  )
}

export const APIKeyInput = ({
  field,
  placeholder,
}: {
  field: FieldApi<any, any, any, any>
  placeholder: string
}) => {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
  }, [field.state.value])

  const inputId = `API-key-input-${placeholder.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="relative w-full">
      <div className="flex items-center">
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <Input
          id={inputId}
          type="password"
          placeholder={placeholder}
          aria-label={placeholder}
          value={field.state.value}
          onChange={(e) => {
            field.handleChange(e.target.value)
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              field.form.handleSubmit()
            }
          }}
          className="flex-1 rounded-[4px] bg-(--background) p-2 text-(--foreground)"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear"
          onClick={(e) => {
            e.preventDefault()
            field.handleChange('')
            field.form.handleSubmit()
          }}
          className="ml-2 text-(--foreground-faded) hover:bg-(--dashboard-button) hover:text-(--dashboard-button-foreground) hover:text-white"
        >
          <IconX size={12} aria-hidden="true" />
        </Button>
      </div>
      <FieldInfo field={field} />
      <div className="mt-2 flex items-center justify-between">
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div>
          <Button
            type="button"
            size="xs"
            className="bg-(--dashboard-button) text-(--dashboard-button-foreground) hover:bg-(--dashboard-button-hover)"
            onClick={() => {
              field.form.handleSubmit()
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

const NewModelDropdown: React.FC<{
  value: AnySupportedModel
  onChange: (model: AnySupportedModel) => Promise<void>
  llmProviders: AllLLMProviders
  isSmallScreen: boolean
  chatbotId: string
}> = ({ value, onChange, llmProviders, isSmallScreen, chatbotId }) => {
  // Filter out providers that are not enabled and their models which are disabled
  const { enabledProvidersAndModels, allModels } = Object.keys(
    llmProviders,
  ).reduce(
    (
      acc: {
        enabledProvidersAndModels: Record<string, LLMProvider>
        allModels: AnySupportedModel[]
      },
      key,
    ) => {
      const provider = llmProviders[key as keyof typeof llmProviders]
      if (provider && provider.enabled) {
        const enabledModels =
          provider.models?.filter((model: { enabled: any }) => model.enabled) ||
          []
        if (enabledModels.length > 0) {
          // @ts-ignore -- Can't figure out why the types aren't perfect.
          acc.enabledProvidersAndModels[key as keyof typeof llmProviders] = {
            ...provider,
            models: enabledModels,
          }
          acc.allModels.push(
            ...enabledModels.map((model: any) => ({
              ...model,
              provider: provider.provider,
            })),
          )
        }
      }
      return acc
    },
    {
      enabledProvidersAndModels: {} as Record<string, LLMProvider>,
      allModels: [] as AnySupportedModel[],
    },
  )
  const selectedModel =
    allModels.find((model) => model.id === value?.id) || undefined
  const selectedModelCountry = getCountryOfConcern(value?.id)

  const [pendingDefault, setPendingDefault] = useState<{
    model: AnySupportedModel
    country: CountryOfConcern
  } | null>(null)

  const closePendingModal = () => setPendingDefault(null)
  const confirmPendingDefault = async () => {
    if (!pendingDefault) return
    const next = pendingDefault.model
    markChatbotCocAcknowledged(chatbotId)
    setPendingDefault(null)
    await onChange(next)
  }

  // Grouped by provider, in LLM_PROVIDER_ORDER, nested per Base UI
  // Combobox's grouping API.
  const groupedModels: ModelComboboxGroup[] = Object.entries(
    enabledProvidersAndModels,
  )
    .sort(([providerA], [providerB]) => {
      const indexA = LLM_PROVIDER_ORDER.indexOf(providerA as ProviderNames)
      const indexB = LLM_PROVIDER_ORDER.indexOf(providerB as ProviderNames)
      // Providers not in the order list will be placed at the end
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
    .map(([, provider]) => ({
      value: provider.provider as string,
      items: (provider.models ?? []).map((model: AnySupportedModel) => ({
        value: model.id,
        label: model.name,
        // @ts-ignore -- this being missing is fine
        downloadSize: model?.downloadSize,
        modelId: model.id,
        selectedModelId: value?.id,
        modelType: provider.provider,
        // @ts-ignore -- this being missing is fine
        vram_required_MB: model.vram_required_MB,
      })),
    }))
    .filter((group) => group.items.length > 0)

  const selectedComboboxItem =
    groupedModels
      .flatMap((group) => group.items)
      .find((item) => item.value === value?.id) ?? null

  return (
    <>
      <Combobox
        items={groupedModels}
        value={selectedComboboxItem}
        isItemEqualToValue={(item, val) =>
          (item as ModelComboboxItem | null)?.value ===
          (val as ModelComboboxItem | null)?.value
        }
        onValueChange={async (item) => {
          const selected = item as ModelComboboxItem | null
          if (!selected) return
          const nextModel = allModels.find(
            (model) => model.id === selected.value,
          )
          if (!nextModel) return
          const country = getCountryOfConcern(nextModel.id)
          if (country && !isChatbotCocAcknowledged(chatbotId)) {
            setPendingDefault({ model: nextModel, country })
            return
          }
          await onChange(nextModel)
        }}
      >
        <ComboboxInputGroup className="w-full border-(--button) bg-(--background) text-(--foreground)">
          {selectedModel && (
            <Image
              // @ts-ignore -- this being missing is fine
              src={getModelLogo(selectedModel.provider)}
              // @ts-ignore -- this being missing is fine
              alt={`${selectedModel.provider} logo`}
              width={20}
              height={20}
              aria-hidden="true"
              style={{ borderRadius: '4px' }}
            />
          )}
          <ComboboxInput
            id="default-model-select"
            placeholder="Select a model"
            aria-label="Select a model"
            className={`${montserrat_paragraph.variable} font-montserratParagraph truncate text-ellipsis ${
              isSmallScreen ? 'text-xs' : 'text-sm'
            }`}
          />
          <div className="flex items-center gap-1">
            {selectedModelCountry && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      aria-label={`Country of concern warning: ${selectedModelCountry}`}
                      className="inline-flex items-center"
                    />
                  }
                >
                  <IconAlertTriangleFilled
                    size="1rem"
                    aria-hidden="true"
                    className="text-yellow-500"
                  />
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-wrap">
                  {getCountryOfConcernShortMessage(selectedModelCountry)}
                </TooltipContent>
              </Tooltip>
            )}
            <ComboboxTrigger className="text-(--foreground)">
              <IconChevronDown size="1rem" aria-hidden="true" />
            </ComboboxTrigger>
          </div>
        </ComboboxInputGroup>
        <ComboboxContent
          className="rounded-md border border-(--background-dark) bg-(--background) text-(--foreground) shadow-xs"
          style={{ maxHeight: '520px' }}
        >
          <ComboboxEmpty>Nothing found</ComboboxEmpty>
          <ComboboxList>
            {(group: ModelComboboxGroup) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxGroupLabel>{group.value}</ComboboxGroupLabel>
                <ComboboxCollection>
                  {(item: ModelComboboxItem) => (
                    <ComboboxItem
                      key={item.value}
                      value={item}
                      className={`${montserrat_paragraph.variable} font-montserratParagraph text-(--foreground) data-highlighted:bg-(--foreground-faded) ${
                        isSmallScreen ? 'text-xs' : 'text-sm'
                      }`}
                    >
                      <ModelItem {...item} />
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <CountryOfConcernModal
        opened={pendingDefault !== null}
        onClose={closePendingModal}
        onConfirm={confirmPendingDefault}
        title="Default Model — Country of Concern Warning"
        confirmLabel="Set as default anyway"
      >
        {pendingDefault && (
          <>
            Setting <strong>{pendingDefault.model.name}</strong> as the default
            model is discouraged because it originates from a country of
            concern.{' '}
            {getCountryOfConcernLongMessage(
              pendingDefault.model.name,
              pendingDefault.country,
            )}
          </>
        )}
      </CountryOfConcernModal>
    </>
  )
}

interface ModelComboboxItem {
  value: string
  label: string
  downloadSize?: string
  modelId: string
  selectedModelId: string | undefined
  modelType: string
  vram_required_MB: number
}

interface ModelComboboxGroup {
  value: string
  items: ModelComboboxItem[]
}

export function ModelItem({ label, modelId, modelType }: ModelComboboxItem) {
  const countryOfConcern = getCountryOfConcern(modelId)
  return (
    <div className="flex flex-nowrap items-center">
      <Image
        aria-hidden="true"
        src={getModelLogo(modelType) || ''}
        alt={`${modelType} logo`}
        width={20}
        height={20}
        style={{ marginRight: '8px', borderRadius: '4px' }}
      />
      <span className="ml-2 text-sm">{label}</span>
      {countryOfConcern && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-label={`Country of concern warning: ${countryOfConcern}`}
                className="ml-1.5 inline-flex items-center"
              />
            }
          >
            <IconAlertTriangleFilled
              size="0.9rem"
              aria-hidden="true"
              className="text-yellow-500"
            />
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px] text-wrap">
            {getCountryOfConcernShortMessage(countryOfConcern)}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export function findDefaultModel(
  providers: AllLLMProviders,
): (AnySupportedModel & { provider: ProviderNames }) | undefined {
  for (const providerKey in providers) {
    const provider = providers[providerKey as keyof typeof providers]
    if (provider && provider.models) {
      const currentDefaultModel = provider.models.find(
        (model: AnySupportedModel) => model.default === true,
      )
      if (currentDefaultModel) {
        return {
          ...currentDefaultModel,
          provider: providerKey as ProviderNames,
        }
      }
    }
  }
  return undefined
}

export default function APIKeyInputForm({
  projectName: projectNameProp,
  isEmbedded = false,
}: {
  projectName?: string
  isEmbedded?: boolean
} = {}) {
  const routerProjectName = GetCurrentPageName()
  const projectName = projectNameProp || routerProjectName
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialCollapsedState(),
  )

  // Get responsive card width classes based on sidebar state
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed)

  // ------------ <TANSTACK QUERIES> ------------
  const queryClient = useQueryClient()
  const {
    data: llmProviders,
    isLoading: isLoadingLLMProviders,
    isError: isErrorLLMProviders,
    error: errorLLMProviders,
    // enabled: !!projectName // Only run the query when projectName is available
  } = useFetchLLMProviders({ projectName })

  useEffect(() => {
    if (llmProviders) {
      form.reset()
    }
  }, [llmProviders])

  useEffect(() => {
    // handle errors
    if (isErrorLLMProviders) {
      showConfirmationToast({
        title: 'Error',
        message:
          'Failed your api keys. Our database must be having a bad day. Please refresh or try again later.',
        isError: true,
      })
    }
  }, [isErrorLLMProviders])

  const mutation = useUpdateProjectLLMProviders(queryClient)

  const setDefaultModelAndUpdateProviders = (
    newDefaultModel: AnySupportedModel & { provider: ProviderNames },
  ) => {
    // Update the llmProviders state
    form.setFieldValue(
      'providers',
      (prevProviders: AllLLMProviders | undefined) => {
        if (!prevProviders) return prevProviders
        const updatedProviders = { ...prevProviders }

        // Reset default for all models
        Object.keys(updatedProviders).forEach((providerKey) => {
          const provider =
            updatedProviders[providerKey as keyof AllLLMProviders]
          if (provider && provider.models) {
            provider.models = provider.models.map(
              (model: AnySupportedModel) => ({
                ...model,
                default: false,
              }),
            )
          }
        })

        // Set the new default model
        const provider =
          updatedProviders[newDefaultModel.provider as keyof AllLLMProviders]
        if (provider && provider.models) {
          const modelIndex = provider.models.findIndex(
            (model: AnySupportedModel) => model.id === newDefaultModel.id,
          )
          if (modelIndex !== -1) {
            ;(provider.models as any[])[modelIndex] = {
              ...(provider.models as any[])[modelIndex],
              default: true,
            }
          }
        }

        newDefaultModel.default = true
        return updatedProviders
      },
    )
  }

  const updateDefaultModelTemperature = (newTemperature: number) => {
    // Update the llmProviders state
    form.setFieldValue(
      'providers',
      (prevProviders: AllLLMProviders | undefined) => {
        let currdefaultModel
        if (prevProviders) {
          currdefaultModel = findDefaultModel(prevProviders)
        }

        if (!prevProviders || !currdefaultModel) {
          return prevProviders
        }

        const updatedProviders = { ...prevProviders }

        // Update the temperature for the default model
        const provider =
          updatedProviders[currdefaultModel.provider as keyof AllLLMProviders]
        if (provider?.models) {
          const modelIndex = provider.models.findIndex(
            (model: AnySupportedModel) => model.default === true,
          )
          if (modelIndex !== -1) {
            const currentModel = provider.models[modelIndex]
            if (currentModel) {
              provider.models[modelIndex] = {
                ...currentModel,
                temperature: newTemperature,
              }
            }
          }
        }

        // Update the defaultModel state
        return updatedProviders
      },
    )
  }

  // ------------ </TANSTACK QUERIES> ------------

  const form = useForm({
    defaultValues: {
      providers: llmProviders,
    },
    onSubmit: async ({ value }) => {
      const llmProviders = value.providers as AllLLMProviders
      mutation.mutate(
        {
          projectName,
          // queryClient,
          llmProviders,
        },
        {
          onSuccess: (data, variables, context) => {
            queryClient.invalidateQueries({
              queryKey: ['projectLLMProviders', projectName],
            })
            showConfirmationToast({
              title: 'Updated LLM providers',
              message: `Now your project's users can use the supplied LLMs!`,
            })
          },
          onError: (error, variables, context) =>
            showConfirmationToast({
              title: 'Error updating LLM providers',
              message: `Update failed with error: ${error.name} -- ${error.message}`,
              isError: true,
            }),
        },
      )
    },
  })

  // if (isLoadingLLMProviders) {
  //   return (
  //     <div className="flex h-screen items-center justify-center">
  //       <Text>Loading...</Text>
  //     </div>
  //   )
  // }

  // if (isErrorLLMProviders) {
  //   return (
  //     <div className="flex h-screen items-center justify-center">
  //       <Text>
  //         Failed to load API keys. Please try again later.{' '}
  //         {errorLLMProviders?.message}
  //       </Text>
  //     </div>
  //   )
  // }

  // Embedded form content for wizard steps
  const formContent = (
    <div className="llm-providers-form">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
      >
        <div>
          {/* Default Model Section */}
          <div className="rounded-lg border border-(--dashboard-border) bg-(--dashboard-sidebar-background) p-4">
            <h4 className="text-lg font-bold text-(--foreground)">
              Default Model
            </h4>
            <p className="mb-3 text-sm text-(--foreground-faded)">
              Choose the default model for your chatbot. Users can still
              override this default.
            </p>
            <div className="flex justify-center">
              {isLoadingLLMProviders ? (
                <Skeleton className="h-10 w-full rounded-md bg-(--dashboard-background-faded)" />
              ) : llmProviders ? (
                <NewModelDropdown
                  value={findDefaultModel(llmProviders) as AnySupportedModel}
                  onChange={(newDefaultModel) => {
                    const modelWithProvider = {
                      ...newDefaultModel,
                      provider:
                        (newDefaultModel as any).provider ||
                        findDefaultModel(llmProviders)?.provider,
                    }
                    setDefaultModelAndUpdateProviders(
                      modelWithProvider as AnySupportedModel & {
                        provider: ProviderNames
                      },
                    )
                    return form.handleSubmit()
                  }}
                  llmProviders={llmProviders}
                  isSmallScreen={isSmallScreen}
                  chatbotId={projectName}
                />
              ) : null}
            </div>
          </div>

          {/* Open source LLMs */}
          <h4 className="mt-6 text-lg font-bold text-(--foreground)">
            Open source LLMs
          </h4>
          <p className="mb-3 text-sm text-(--foreground-faded)">
            Your weights, your rules.
          </p>
          <div className="flex w-full flex-col flex-wrap items-start justify-start gap-4 xl:flex-row">
            <NCSAHostedLLmsProviderInput
              provider={llmProviders?.NCSAHosted as NCSAHostedProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
            <NCSAHostedVLMProviderInput
              provider={llmProviders?.NCSAHostedVLM as NCSAHostedVLMProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
            <OllamaProviderInput
              provider={llmProviders?.Ollama as OllamaProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
            <WebLLMProviderInput
              provider={llmProviders?.WebLLM as WebLLMProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
          </div>

          <h4 className="mt-6 text-lg font-bold text-(--foreground)">
            Closed source LLMs
          </h4>
          <p className="mb-3 text-sm text-(--foreground-faded)">
            The best performers, but you gotta pay their prices and follow their
            rules.
          </p>
          <div className="flex w-full flex-col flex-wrap items-start justify-start gap-4 xl:flex-row">
            <AnthropicProviderInput
              provider={llmProviders?.Anthropic as AnthropicProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
            <OpenAIProviderInput
              provider={llmProviders?.OpenAI as OpenAIProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
            <AzureProviderInput
              provider={llmProviders?.Azure as AzureProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
            <BedrockProviderInput
              provider={llmProviders?.Bedrock as BedrockProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
            <GeminiProviderInput
              provider={llmProviders?.Gemini as GeminiProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
            <SambaNovaProviderInput
              provider={llmProviders?.SambaNova as SambaNovaProvider}
              form={form}
              isLoading={isLoadingLLMProviders}
            />
          </div>
        </div>
      </form>
    </div>
  )

  // Return embedded form content without page layout
  if (isEmbedded) {
    return formContent
  }

  return (
    <SettingsLayout
      course_name={projectName}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
    >
      <Head>
        <title>{projectName} — LLMs — Illinois Chat</title>
        <meta
          name="UIUC.chat"
          content="The AI teaching assistant built for students at UIUC."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main
        id="main-content"
        tabIndex={-1}
        className="course-page-main flex min-h-screen w-full flex-col items-center"
      >
        <h1 className="sr-only">{projectName} — LLMs — Illinois Chat</h1>
        <div className="items-left flex w-full flex-col justify-center py-0">
          <div className="flex w-full flex-col items-center">
            <Card
              className={`mt-[2%] ${cardWidthClasses} gap-0 rounded-4xl border py-0 text-base shadow-none ring-0`}
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--dashboard-border)',
              }}
            >
              <div className="flex flex-col md:flex-row">
                <div
                  style={{
                    border: 'None',
                    color: 'text-(--foreground)',
                  }}
                  className="min-h-full flex-[1_1_100%] bg-(--background) md:flex-[1_1_70%]"
                >
                  <div className="flex flex-col items-start justify-start gap-4 lg:ml-4">
                    <h2
                      className={`heading-h2 pt-4 pr-2 pl-4 text-left ${montserrat_heading.variable} font-montserratHeading text-(--foreground)`}
                    >
                      {/* API Keys: Add LLMs to your Chatbot */}
                      Configure LLM Providers for your Chatbot
                    </h2>
                    <h3
                      className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading ml-4 flex-[1_1_50%] px-[18px] text-left text-(--foreground)`}
                    >
                      Configure which LLMs are available to your users. Enable
                      or disable models to balance price and performance.
                    </h3>
                    <div className="flex flex-col items-center justify-start">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          form.handleSubmit()
                        }}
                      >
                        {/* Providers */}
                        <div className="flex flex-col gap-4 px-8 pb-8">
                          <>
                            <h3
                              className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading mt-4 text-(--foreground)`}
                            >
                              Closed source LLMs
                            </h3>
                            <p
                              className={`pl-1 ${montserrat_paragraph.variable} font-montserratParagraph text-base text-(--foreground-faded)`}
                            >
                              The best performers, but you gotta pay their
                              prices and follow their rules.
                            </p>
                            <div className="flex w-full flex-row flex-wrap items-start justify-start gap-4">
                              {' '}
                              <AnthropicProviderInput
                                provider={
                                  llmProviders?.Anthropic as AnthropicProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <OpenAIProviderInput
                                provider={
                                  llmProviders?.OpenAI as OpenAIProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <OpenAICompatibleProviderInput
                                provider={
                                  llmProviders?.OpenAICompatible as OpenAICompatibleProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <AzureProviderInput
                                provider={llmProviders?.Azure as AzureProvider}
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <BedrockProviderInput
                                provider={
                                  llmProviders?.Bedrock as BedrockProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <GeminiProviderInput
                                provider={
                                  llmProviders?.Gemini as GeminiProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <SambaNovaProviderInput
                                provider={
                                  llmProviders?.SambaNova as SambaNovaProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                            </div>
                            <h3
                              className={`heading-h3 -mb-3 ${montserrat_heading.variable} font-montserratHeading mt-4 text-(--foreground)`}
                            >
                              Open source LLMs
                            </h3>
                            <p
                              className={`pl-1 ${montserrat_paragraph.variable} font-montserratParagraph text-base text-(--foreground-faded)`}
                            >
                              Your weights, your rules.
                            </p>
                            <div className="flex w-full flex-row flex-wrap items-start justify-start gap-4">
                              {' '}
                              <NCSAHostedLLmsProviderInput
                                provider={
                                  llmProviders?.NCSAHosted as NCSAHostedProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <NCSAHostedVLMProviderInput
                                provider={
                                  llmProviders?.NCSAHostedVLM as NCSAHostedVLMProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <OllamaProviderInput
                                provider={
                                  llmProviders?.Ollama as OllamaProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                              <WebLLMProviderInput
                                provider={
                                  llmProviders?.WebLLM as WebLLMProvider
                                }
                                form={form}
                                isLoading={isLoadingLLMProviders}
                              />
                            </div>
                          </>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
                <div
                  className="flex flex-[1_1_100%] md:flex-[1_1_30%]"
                  style={{
                    //flex: isSmallScreen ? '1 1 100%' : '1 1 40%',
                    padding: '1rem',
                    backgroundColor: 'var(--dashboard-sidebar-background)',
                    color: 'var(--dashboard-foreground)',
                    borderLeft: isSmallScreen
                      ? ''
                      : '1px solid var(--dashboard-border)',
                  }}
                >
                  <div className="flex h-full flex-col justify-center">
                    <div className="flex flex-auto flex-col gap-2 p-2">
                      <div className="pb-4">
                        <h3
                          className={`heading-h3 px-1 py-2 ${montserrat_heading.variable} font-montserratHeading`}
                        >
                          Default Model
                        </h3>
                        <br />
                        <p
                          className={`pl-1 ${montserrat_paragraph.variable} font-montserratParagraph text-base`}
                        >
                          Choose the default model for your chatbot. Users can
                          still override this default to use any of the models
                          enabled on the left.
                        </p>
                        <br />
                        <div className="flex justify-center">
                          {isLoadingLLMProviders ? (
                            <Skeleton className="h-10 w-full rounded-md bg-(--dashboard-background-faded)" />
                          ) : llmProviders ? (
                            <NewModelDropdown
                              value={
                                findDefaultModel(
                                  llmProviders,
                                ) as AnySupportedModel
                              }
                              onChange={(newDefaultModel) => {
                                const modelWithProvider = {
                                  ...newDefaultModel,
                                  provider:
                                    (newDefaultModel as any).provider ||
                                    findDefaultModel(llmProviders)?.provider,
                                }
                                setDefaultModelAndUpdateProviders(
                                  modelWithProvider as AnySupportedModel & {
                                    provider: ProviderNames
                                  },
                                )
                                return form.handleSubmit()
                              }}
                              llmProviders={llmProviders}
                              isSmallScreen={isSmallScreen}
                              chatbotId={projectName}
                            />
                          ) : null}
                        </div>
                        <div className="pt-6"></div>
                        {/* <div>
                          {llmProviders && (
                            // @ts-ignore - we don't really need this named functionality... gonna skip fixing this.
                            <form.Field name="defaultTemperature">
                              {(field) => (
                                <>
                                  <Text
                                    size="sm"
                                    weight={500}
                                    mb={4}
                                    className={`pl-1 ${montserrat_paragraph.variable} font-montserratParagraph`}
                                  >
                                    Default Temperature:{' '}
                                    {
                                      findDefaultModel(llmProviders)
                                        ?.temperature
                                    }
                                  </Text>
                                  <Text
                                    size="xs"
                                    mt={4}
                                    className={`pl-1 text-gray-600 ${montserrat_paragraph.variable} font-montserratParagraph`}
                                  >
                                    We recommended using 0.1. Higher values
                                    increase randomness or
                                    &apos;creativity&apos;, lower force the
                                    model to stick to its normal behavior.
                                  </Text>
                                  <Slider
                                    aria-label="Temperature"
                                    value={
                                      findDefaultModel(llmProviders)
                                        ?.temperature
                                    }
                                    onChange={(newTemperature) => {
                                      updateDefaultModelTemperature(
                                        newTemperature,
                                      )
                                      field.handleChange(newTemperature)
                                      form.handleSubmit()
                                    }}
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    precision={1}
                                    marks={[
                                      { value: 0, label: t('Precise') },
                                      { value: 0.5, label: t('Neutral') },
                                      { value: 1, label: t('Creative') },
                                    ]}
                                    showLabelOnHover
                                    color="grape"
                                    className="m-2"
                                    size={isSmallScreen ? 'xs' : 'md'}
                                    classNames={{
                                      markLabel: `mx-2 text-neutral-300 ${montserrat_paragraph.variable} font-montserratParagraph mt-2 ${isSmallScreen ? 'text-xs' : ''}`,
                                    }}
                                  />
                                  <FieldInfo field={field} />
                                </>
                              )}
                            </form.Field>
                          )}
                        </div> */}
                        <div className="pt-2" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* SECTION: OTHER INFO, TBD */}
            {/* <div
              className="mx-auto mt-[2%] w-[90%] items-start rounded-2xl shadow-md"
              style={{ zIndex: 1, background: '#15162c' }}
            >
              <Flex direction="row" justify="space-between">
                <div className="flex flex-col items-start justify-start">
                  <Title
                    className={`${montserrat_heading.variable} font-montserratHeading`}
                    variant="gradient"
                    gradient={{
                      from: 'hsl(280,100%,70%)',
                      to: 'white',
                      deg: 185,
                    }}
                    order={3}
                    p="xl"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Title
                      order={3}
                      pt={40}
                      // w={}
                      // size={'xl'}
                      className={`pb-3 pt-3 ${montserrat_paragraph.variable} font-montserratParagraph`}
                    >
                      OTHER INFO, TBD
                    </Title>
                  </Title>
                </div>
                <div className=" flex flex-col items-end justify-center">
                  
                </div>
              </Flex>
            </div> */}
          </div>
        </div>
      </main>

      <GlobalFooter />
    </SettingsLayout>
  )
}

// This is a BEAUTIFUL component. Should use this more places.
export const showConfirmationToast = ({
  title,
  message,
  isError = false,
  autoClose = 5000, // Optional parameter with default value
}: {
  title: string
  message: string
  isError?: boolean
  autoClose?: number
}) => {
  showToast({
    title: title,
    message: message,
    type: isError ? 'error' : 'success',
    autoClose: autoClose,
  })
}
