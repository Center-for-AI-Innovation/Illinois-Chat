import { useState } from 'react'
import { CircleAlert, ExternalLink } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/shadcn/ui/alert'
import { Button } from '@/components/shadcn/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/shadcn/ui/card'
import { Switch } from '@/components/shadcn/ui/switch'
import { type LLMProvider } from '~/utils/modelProviders/LLMProvider'
import { type ProviderConfig } from './ai-models.providers'
import { ModelList } from './ModelList'
import { ProviderField } from './ProviderField'
import {
  type AIModelsSettings,
  type ProviderFieldValues,
} from './useAIModelsSettings'

interface AIModelsProviderCardProps {
  config: ProviderConfig
  provider: LLMProvider
  projectName: string
  actions: Pick<
    AIModelsSettings,
    'toggleProvider' | 'toggleModel' | 'saveProviderFields'
  >
}

type Drafts = Partial<Record<keyof ProviderFieldValues, string>>

// Named to avoid colliding with the legacy api-inputs/providers/ProviderCard.
export function AIModelsProviderCard({
  config,
  provider,
  projectName,
  actions,
}: AIModelsProviderCardProps) {
  // Only fields the user has edited are drafts; everything else shows the
  // server value, so a refetch updates untouched fields automatically.
  const [drafts, setDrafts] = useState<Drafts>({})
  const [saving, setSaving] = useState(false)

  const fields = config.fields ?? []
  const serverValue = (name: keyof ProviderFieldValues) =>
    (provider as ProviderFieldValues)[name] ?? ''
  const valueOf = (name: keyof ProviderFieldValues) =>
    drafts[name] ?? serverValue(name)
  const errors = Object.fromEntries(
    fields.map((f) => [f.name, f.validate?.(valueOf(f.name))]),
  )
  const isDirty = Object.keys(drafts).length > 0
  const hasErrors = Object.values(errors).some(Boolean)

  const save = async () => {
    setSaving(true)
    const saved = await actions.saveProviderFields(config.key, drafts)
    setSaving(false)
    if (saved) setDrafts({})
  }

  const models = provider.models ?? []
  const showModels =
    models.length > 0 && (config.showModels?.(provider) ?? true)
  const headingId = `provider-${config.key}-title`

  return (
    <Card role="group" aria-labelledby={headingId}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-1.5">
            <span id={headingId}>{config.name}</span>
            {config.externalUrl && (
              <a
                href={config.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${config.name} website (opens in a new tab)`}
                className="text-foreground hover:text-primary rounded-xs"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            )}
          </CardTitle>
          <Switch
            checked={provider.enabled}
            onCheckedChange={(enabled) =>
              void actions.toggleProvider(config.key, enabled)
            }
            aria-label={`Enable ${config.name}`}
          />
        </div>
        {config.description && (
          <CardDescription className="leading-5">
            {config.description}
          </CardDescription>
        )}
      </CardHeader>

      {provider.enabled && (
        <CardContent className="flex flex-col gap-6 pt-2">
          {provider.error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{provider.error}</AlertDescription>
            </Alert>
          )}

          {fields.length > 0 && (
            <form
              className="flex flex-col gap-6"
              onSubmit={(e) => {
                e.preventDefault()
                if (isDirty && !hasErrors && !saving) void save()
              }}
            >
              <div className="flex flex-col gap-4">
                {fields.map((field) => (
                  <ProviderField
                    key={field.name}
                    label={field.label}
                    placeholder={field.placeholder}
                    secret={field.secret}
                    value={valueOf(field.name)}
                    error={errors[field.name]}
                    onChange={(value) =>
                      setDrafts((d) => ({ ...d, [field.name]: value }))
                    }
                  />
                ))}
              </div>
              <Button
                type="submit"
                size="sm"
                className="self-start"
                disabled={!isDirty || hasErrors || saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </form>
          )}

          {showModels && (
            <ModelList
              projectName={projectName}
              provider={config.key}
              models={models}
              onToggle={(p, id, enabled) =>
                void actions.toggleModel(p, id, enabled)
              }
            />
          )}
        </CardContent>
      )}
    </Card>
  )
}
