import React, { useState } from 'react'
import { CountryOfConcernModal } from './CountryOfConcernModal'
import { CountryOfConcernIcon } from '../CountryOfConcern'
import { Switch } from '@/components/shadcn/ui/switch'
import { type LLMProvider } from '~/utils/modelProviders/LLMProvider'
import {
  isCountryOfConcern,
  isChatbotCocAcknowledged,
  markChatbotCocAcknowledged,
} from '~/utils/modelProviders/countriesOfConcern'
import { GetCurrentPageName } from '../CanViewOnlyCourse'

interface PendingFlaggedModel {
  modelName: string
  field: any
}

export function ModelToggles({
  form,
  provider,
}: {
  form: any
  provider: LLMProvider
}) {
  const providerModels = provider?.provider
    ? form.state.values.providers[provider.provider]?.models || {}
    : {}
  const chatbotId = GetCurrentPageName()

  const [pendingModel, setPendingModel] = useState<PendingFlaggedModel | null>(
    null,
  )

  const closeModal = () => setPendingModel(null)

  const confirmEnable = () => {
    if (!pendingModel) return
    markChatbotCocAcknowledged(chatbotId)
    pendingModel.field.handleChange(true)
    setTimeout(() => form.handleSubmit(), 0)
    setPendingModel(null)
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {Object.entries(providerModels).map(
        ([modelId, modelData]: [string, any]) => {
          const realModelId = modelData?.id ?? modelId
          const isFlagged = isCountryOfConcern(realModelId)
          return (
            <form.Field
              key={modelId}
              name={`providers.${provider.provider}.models.${modelId}.enabled`}
            >
              {(field: any) => {
                const handleChange = (checked: boolean) => {
                  if (
                    checked &&
                    isFlagged &&
                    !isChatbotCocAcknowledged(chatbotId)
                  ) {
                    setPendingModel({ modelName: modelData.name, field })
                    return
                  }
                  field.handleChange(checked)
                  setTimeout(() => form.handleSubmit(), 0)
                }

                return (
                  <div className="flex items-center gap-2">
                    <Switch
                      variant="labeled"
                      showLabels
                      showThumbIcon
                      size="sm"
                      label={modelData.name}
                      checked={field.state.value}
                      onCheckedChange={handleChange}
                    />
                    <CountryOfConcernIcon modelId={realModelId} />
                  </div>
                )
              }}
            </form.Field>
          )
        },
      )}

      <CountryOfConcernModal
        modelName={pendingModel?.modelName ?? null}
        onClose={closeModal}
        onConfirm={confirmEnable}
        title="Country of Concern Warning"
        confirmLabel="Enable anyway"
      />
    </div>
  )
}
