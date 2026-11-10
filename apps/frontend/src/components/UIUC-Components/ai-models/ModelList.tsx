import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import { SwitchField } from '@/components/shadcn/ui/switch-field'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import {
  type AnySupportedModel,
  type ProviderNames,
} from '~/utils/modelProviders/LLMProvider'
import {
  type CountryOfConcern,
  getCountryOfConcern,
  getCountryOfConcernLongMessage,
  getCountryOfConcernShortMessage,
  isChatbotCocAcknowledged,
  markChatbotCocAcknowledged,
} from '~/utils/modelProviders/countriesOfConcern'
import { CountryOfConcernModal } from '../api-inputs/CountryOfConcernModal'

interface ModelListProps {
  projectName: string
  provider: ProviderNames
  models: AnySupportedModel[]
  onToggle: (provider: ProviderNames, modelId: string, enabled: boolean) => void
}

interface PendingModel {
  id: string
  name: string
  country: CountryOfConcern
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
      setPending({ id: model.id, name: model.name, country })
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
          const country = getCountryOfConcern(model.id)
          return (
            <li key={model.id} className="m-0 flex items-center gap-2">
              <SwitchField
                label={model.name}
                checked={model.enabled}
                onCheckedChange={(enabled) => handleChange(model, enabled)}
                className="w-auto"
              />
              {country && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        aria-label={`Country of concern warning: ${country}`}
                        className="inline-flex"
                      />
                    }
                  >
                    <TriangleAlert
                      aria-hidden="true"
                      className="size-4 fill-yellow-500 text-white"
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px] text-wrap">
                    {getCountryOfConcernShortMessage(country)}
                  </TooltipContent>
                </Tooltip>
              )}
            </li>
          )
        })}
      </ul>

      <CountryOfConcernModal
        opened={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        title="Country of Concern Warning"
        confirmLabel="Enable anyway"
      >
        {pending &&
          getCountryOfConcernLongMessage(pending.name, pending.country)}
      </CountryOfConcernModal>
    </>
  )
}
