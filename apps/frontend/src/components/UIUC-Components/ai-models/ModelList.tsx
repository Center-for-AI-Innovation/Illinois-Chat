import { useState } from 'react'

import { SwitchField } from '@/components/shadcn/ui/switch-field'
import { CountryOfConcernIcon } from '~/components/UIUC-Components/CountryOfConcern'
import {
  type AnySupportedModel,
  type ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import {
  getCountryOfConcern,
  isChatbotCocAcknowledged,
  markChatbotCocAcknowledged,
} from '~/utils/modelProviders/countriesOfConcern'
import { CountryOfConcernModal } from '~/components/UIUC-Components/api-inputs/CountryOfConcernModal'

interface ModelListProps {
  projectName: string
  provider: ProviderNames
  models: AnySupportedModel[]
  onToggle: (provider: ProviderNames, modelId: string, enabled: boolean) => void
}

interface PendingModel {
  id: string
  name: string
}

// Figma "Provider Card / Model List Item": a left-side switch per model.
// Enabling a model from a country of concern asks for a one-time
// acknowledgement per chatbot first (same rule as the legacy /llms page).
export function ModelList({
  projectName,
  provider,
  models,
  onToggle,
}: ModelListProps) {
  const [pending, setPending] = useState<PendingModel | null>(null)

  const handleChange = (model: AnySupportedModel, enabled: boolean) => {
    const country = getCountryOfConcern(model.id)
    if (enabled && country && !isChatbotCocAcknowledged(projectName)) {
      setPending({ id: model.id, name: model.name })
      return
    }
    onToggle(provider, model.id, enabled)
  }

  const confirmPending = () => {
    if (!pending) return
    markChatbotCocAcknowledged(projectName)
    onToggle(provider, pending.id, true)
    setPending(null)
  }

  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Models">
        {models.map((model) => {
          return (
            <li key={model.id} className="m-0 flex items-center gap-2">
              <SwitchField
                label={model.name}
                checked={model.enabled}
                onCheckedChange={(enabled) => handleChange(model, enabled)}
                className="w-auto"
              />
              <CountryOfConcernIcon modelId={model.id} />
            </li>
          )
        })}
      </ul>

      <CountryOfConcernModal
        modelName={pending?.name ?? null}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        title="Country of Concern Warning"
        confirmLabel="Enable anyway"
      />
    </>
  )
}
