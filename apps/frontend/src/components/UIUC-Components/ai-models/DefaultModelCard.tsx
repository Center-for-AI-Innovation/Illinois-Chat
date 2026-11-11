import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/shadcn/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select'
import {
  type AllLLMProviders,
  type AnySupportedModel,
  LLM_PROVIDER_ORDER,
  type ProviderNames,
} from '~/utils/modelProviders/LLMProvider'

interface DefaultModelCardProps {
  llmProviders: AllLLMProviders
  onChange: (model: { id: string; provider: ProviderNames }) => void
}

const toValue = (provider: ProviderNames, id: string) => `${provider}::${id}`

// Only enabled models of enabled providers can be the default.
function enabledModelGroups(providers: AllLLMProviders) {
  return LLM_PROVIDER_ORDER.flatMap((key) => {
    const provider = providers[key]
    const models = (provider?.enabled ? (provider.models ?? []) : []).filter(
      (m: AnySupportedModel) => m.enabled,
    )
    return models.length ? [{ provider: key, models }] : []
  })
}

export function DefaultModelCard({
  llmProviders,
  onChange,
}: DefaultModelCardProps) {
  const groups = enabledModelGroups(llmProviders)
  const current = groups
    .flatMap((g) => g.models.map((m) => ({ ...m, provider: g.provider })))
    .find((m) => m.default)
  const labels = new Map(
    groups.flatMap((g) =>
      g.models.map((m) => [toValue(g.provider, m.id), m.name] as const),
    ),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Model</CardTitle>
        <CardDescription className="leading-5">
          Choose the default model for your chatbot. Users can still override
          this default to use any of the models enabled below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          value={current ? toValue(current.provider, current.id) : null}
          onValueChange={(value) => {
            if (typeof value !== 'string') return
            const [provider, ...id] = value.split('::')
            onChange({
              provider: provider as ProviderNames,
              id: id.join('::'),
            })
          }}
        >
          <SelectTrigger aria-label="Default model" className="w-full max-w-96">
            <SelectValue placeholder="Select a model">
              {(value: string | null) => (value ? labels.get(value) : null)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group.provider}>
                <SelectLabel>{group.provider}</SelectLabel>
                {group.models.map((model: AnySupportedModel) => (
                  <SelectItem
                    key={model.id}
                    value={toValue(group.provider, model.id)}
                  >
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}
