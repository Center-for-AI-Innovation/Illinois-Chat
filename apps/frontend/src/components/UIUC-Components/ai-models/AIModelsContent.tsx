import { Fragment, type ReactNode } from 'react'
import { CircleAlert, FileSpreadsheet } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/shadcn/ui/alert'
import { Separator } from '@/components/shadcn/ui/separator'
import { Skeleton } from '@/components/shadcn/ui/skeleton'
import { type AllLLMProviders } from '~/utils/modelProviders/LLMProvider'
import { AIModelsProviderCard } from './AIModelsProviderCard'
import {
  CLOSED_SOURCE_PROVIDERS,
  OPEN_SOURCE_PROVIDERS,
  type ProviderConfig,
} from './ai-models.providers'
import { AI_MODELS_SECTIONS } from './ai-models.sections'
import { DefaultModelCard } from './DefaultModelCard'
import { type AIModelsSettings } from './useAIModelsSettings'

const SECTION_DESCRIPTIONS: Partial<
  Record<(typeof AI_MODELS_SECTIONS)[number]['id'], string>
> = {
  'open-source': 'Your weights, your rules.',
  'closed-source':
    'The best performers, but you gotta pay their prices and follow their rules.',
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  const description =
    SECTION_DESCRIPTIONS[id as keyof typeof SECTION_DESCRIPTIONS]
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2
          id={id}
          className="text-foreground scroll-mt-6 text-lg leading-7 font-semibold"
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm leading-5 text-(--foreground-subtle)">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

function ProviderGrid({
  configs,
  llmProviders,
  settings,
  projectName,
}: {
  configs: ProviderConfig[]
  llmProviders: AllLLMProviders
  settings: AIModelsSettings
  projectName: string
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 lg:grid-cols-2">
      {configs.map((config) => {
        const provider = llmProviders[config.key]
        if (!provider) return null
        return (
          <AIModelsProviderCard
            key={config.key}
            config={config}
            provider={provider}
            projectName={projectName}
            actions={settings}
          />
        )
      })}
    </div>
  )
}

export function AIModelsContent({
  projectName,
  settings,
}: {
  projectName: string
  settings: AIModelsSettings
}) {
  const { llmProviders, isLoading, isError } = settings

  const body = (id: string) => {
    if (!llmProviders) return null
    if (id === 'default-model') {
      return (
        <DefaultModelCard
          llmProviders={llmProviders}
          onChange={(model) => void settings.setDefaultModel(model)}
        />
      )
    }
    return (
      <ProviderGrid
        configs={
          id === 'open-source' ? OPEN_SOURCE_PROVIDERS : CLOSED_SOURCE_PROVIDERS
        }
        llmProviders={llmProviders}
        settings={settings}
        projectName={projectName}
      />
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 pt-10 pr-14 pb-5 pl-10">
        <FileSpreadsheet aria-hidden="true" className="size-6" />
        <h1 className="text-foreground text-2xl leading-none font-semibold">
          AI Models
        </h1>
      </div>

      <div className="flex flex-col px-10 pt-6 pb-8">
        {isError && (
          <Alert variant="destructive" className="mb-6">
            <CircleAlert />
            <AlertDescription>
              We couldn&apos;t load your LLM providers. Please refresh or try
              again later.
            </AlertDescription>
          </Alert>
        )}
        {AI_MODELS_SECTIONS.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 && <Separator className="my-10" />}
            <Section id={section.id} title={section.title}>
              {isLoading ? (
                <Skeleton className="h-40 w-full rounded-xl" />
              ) : (
                body(section.id)
              )}
            </Section>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
