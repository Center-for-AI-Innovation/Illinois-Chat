import { useState, useEffect } from 'react'
import { Button } from '@/components/shadcn/ui/button'
import { Textarea } from '@/components/shadcn/ui/textarea'
import { Switch } from '@/components/shadcn/ui/switch'
import { Separator } from '@/components/shadcn/ui/separator'
import { Slider } from '@/components/shadcn/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select'
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
} from '@/components/shadcn/ui/combobox'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useFetchLLMProviders } from '@/hooks/queries/useFetchLLMProviders'
import { findDefaultModel } from './api-inputs/LLMsApiKeyInputForm'
import { type AnySupportedModel } from '~/utils/modelProviders/LLMProvider'
import { montserrat_heading, montserrat_paragraph } from 'fonts'

interface ModelOption {
  value: string
  label: string
}

interface ModelOptionGroup {
  value: string
  items: ModelOption[]
}

interface APIRequestBuilderProps {
  course_name: string
  apiKey: string | null
  courseMetadata?: {
    system_prompt?: string
  }
}

export default function APIRequestBuilder({
  course_name,
  apiKey,
  courseMetadata,
}: APIRequestBuilderProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<
    'curl' | 'python' | 'node'
  >('curl')
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState(false)
  const [userQuery, setUserQuery] = useState('What is in these documents?')
  const [systemPrompt, setSystemPrompt] = useState(
    courseMetadata?.system_prompt ||
      'You are a helpful AI assistant. Follow instructions carefully. Respond using markdown.',
  )
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [retrievalOnly, setRetrievalOnly] = useState(false)
  const [streamEnabled, setStreamEnabled] = useState(true)
  const [temperature, setTemperature] = useState(0.1)

  const { data: llmProviders } = useFetchLLMProviders({
    projectName: course_name,
  })

  useEffect(() => {
    if (llmProviders) {
      const defaultModel = findDefaultModel(llmProviders)
      if (defaultModel) {
        setSelectedModel(defaultModel.id)
      }
    }
  }, [llmProviders])

  useEffect(() => {
    if (courseMetadata?.system_prompt) {
      setSystemPrompt(courseMetadata.system_prompt)
    }
  }, [courseMetadata?.system_prompt])

  const languageOptions = [
    { value: 'curl', label: 'cURL' },
    { value: 'python', label: 'Python' },
    { value: 'node', label: 'Node.js' },
  ]

  const modelOptionGroups: ModelOptionGroup[] = llmProviders
    ? Object.entries(llmProviders).flatMap(([provider, config]) =>
        config.enabled && config.models && provider !== 'WebLLM'
          ? [
              {
                value: provider,
                items: config.models
                  .filter((model: AnySupportedModel) => model.enabled)
                  .map((model: AnySupportedModel) => ({
                    value: model.id,
                    label: model.name,
                  })),
              },
            ]
          : [],
      )
    : []

  const selectedModelOption =
    modelOptionGroups
      .flatMap((group) => group.items)
      .find((option) => option.value === selectedModel) ?? null

  const handleCopyCodeSnippet = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCodeSnippet(true)
    setTimeout(() => setCopiedCodeSnippet(false), 2000)
  }

  /** Escape string for safe embedding inside JSON string value (newlines → \\n, quotes escaped). */
  const escapeForJson = (s: string) => JSON.stringify(s).slice(1, -1)
  /** Escape apostrophes for safe embedding inside a single-quoted shell string. */
  const escapeForSingleQuotedShell = (s: string) => s.replace(/'/g, `'\"'\"'`)
  /** Escape for JSON, then for single-quoted curl -d payload. */
  const escapeForCurlJson = (s: string) =>
    escapeForSingleQuotedShell(escapeForJson(s))

  const baseUrl = process.env.VERCEL_URL || window.location.origin

  const codeSnippets = {
    curl: `curl -X POST ${baseUrl}/api/chat-api/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${selectedModel}",
    "messages": [
      {
        "role": "system",
        "content": "${escapeForCurlJson(systemPrompt)}"
      },
      {
        "role": "user",
        "content": "${escapeForCurlJson(userQuery)}"
      }
    ],
    "api_key": "${apiKey || 'YOUR-API-KEY'}",
    "course_name": "${course_name}",
    "stream": ${streamEnabled},
    "temperature": ${temperature.toFixed(1)},
    "retrieval_only": ${retrievalOnly}
  }'`,
    python: `import requests

url = "${baseUrl}/api/chat-api/chat"
headers = {
  'Content-Type': 'application/json'
}
data = {
  "model": "${selectedModel}",
  "messages": [
    {
      "role": "system",
      "content": "${escapeForJson(systemPrompt)}"
    },
    {
      "role": "user",
      "content": "${escapeForJson(userQuery)}"
    }
  ],
  "api_key": "${apiKey || 'YOUR-API-KEY'}",
  "course_name": "${course_name}",
  "stream": ${streamEnabled ? 'True' : 'False'},
  "temperature": ${temperature.toFixed(1)},
  "retrieval_only": ${retrievalOnly ? 'True' : 'False'}
}

response = requests.post(url, headers=headers, json=data)
${
  streamEnabled
    ? `for chunk in response.iter_lines():
    if chunk:
        print(chunk.decode())`
    : `# Print just the message
print(response.json().get('message'))

# Optionally print contexts
# print(response.json().get('contexts'))`
}`,
    node: `const data = {
  "model": "${selectedModel}",
  "messages": [
    {
      "role": "system",
      "content": "${escapeForJson(systemPrompt)}"
    },
    {
      "role": "user",
      "content": "${escapeForJson(userQuery)}"
    }
  ],
  "api_key": "${apiKey || 'YOUR-API-KEY'}",
  "course_name": "${course_name}",
  "stream": false,
  "temperature": ${temperature},
  "retrieval_only": ${retrievalOnly}
};

fetch('${baseUrl}/api/chat-api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
})
.then(response => response.json())
.then(data => {
  // Print just the message
  console.log(data.message);
  
  // Optionally print contexts
  // console.log(data.contexts);
})
.catch(error => {
  console.error('Error:', error);
});`,
  }

  return (
    <div className="api-request-builder w-full px-4 sm:px-10">
      <h3
        className={`heading-h3 text-left ${montserrat_heading.variable} font-montserratHeading text-(--dashboard-foreground)`}
      >
        Request Builder
      </h3>

      <Separator className="-mx-4 my-5 bg-(--dashboard-background-dark) sm:-mx-10" />

      <div className="space-y-6">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <Select
            value={selectedLanguage}
            onValueChange={(value) =>
              setSelectedLanguage(value as 'curl' | 'python' | 'node')
            }
          >
            <SelectTrigger
              aria-label="Select language"
              className={`w-full shrink-0 cursor-pointer sm:w-[150px] ${montserrat_paragraph.variable} font-montserratParagraph`}
            >
              <SelectValue placeholder="Select language">
                {(value: string | null) =>
                  languageOptions.find((option) => option.value === value)
                    ?.label ?? 'Select language'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="rounded-md data-highlighted:bg-(--foreground-faded) data-highlighted:text-(--foreground)"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex w-full items-center gap-2">
            <Combobox
              items={modelOptionGroups}
              value={selectedModelOption}
              onValueChange={(item: ModelOption | null) =>
                setSelectedModel(item?.value ?? '')
              }
            >
              <ComboboxInputGroup
                className={`min-w-0 flex-1 ${montserrat_paragraph.variable} font-montserratParagraph`}
              >
                <ComboboxInput
                  aria-label="Select model"
                  placeholder="Select model"
                />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>No models found.</ComboboxEmpty>
                <ComboboxList>
                  {(group: ModelOptionGroup) => (
                    <ComboboxGroup key={group.value} items={group.items}>
                      <ComboboxGroupLabel>{group.value}</ComboboxGroupLabel>
                      <ComboboxCollection>
                        {(item: ModelOption) => (
                          <ComboboxItem
                            key={item.value}
                            value={item}
                            className="rounded-md data-highlighted:bg-(--foreground-faded) data-highlighted:text-(--foreground)"
                          >
                            {item.label}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                    </ComboboxGroup>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Button
              aria-label="Copy Code Snippet"
              onClick={() =>
                handleCopyCodeSnippet(codeSnippets[selectedLanguage])
              }
              variant="ghost"
              size="xs"
              className="h-[36px] w-[50px] shrink-0 transform rounded-md bg-(--dashboard-button) text-(--dashboard-button-foreground) hover:bg-(--dashboard-button-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dashboard-button)"
            >
              {copiedCodeSnippet ? (
                <IconCheck aria-hidden="true" />
              ) : (
                <IconCopy aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h4
            className={`text-lg leading-[1.45] font-medium ${montserrat_paragraph.variable} font-montserratParagraph text-(--dashboard-foreground)`}
          >
            System Prompt
          </h4>
          <Textarea
            placeholder="System Prompt"
            aria-label="System Prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.currentTarget.value)}
            rows={2}
            className={`${montserrat_paragraph.variable} font-montserratParagraph`}
          />
        </div>

        <div className="space-y-2">
          <h4
            className={`text-lg leading-[1.45] font-medium ${montserrat_paragraph.variable} font-montserratParagraph text-(--dashboard-foreground)`}
          >
            User Query
          </h4>
          <Textarea
            placeholder="User Query"
            aria-label="User Query"
            value={userQuery}
            onChange={(e) => setUserQuery(e.currentTarget.value)}
            rows={2}
            className={`${montserrat_paragraph.variable} font-montserratParagraph`}
          />
        </div>

        <div className="space-y-2">
          <h4
            className={`text-lg leading-[1.45] font-medium ${montserrat_paragraph.variable} font-montserratParagraph text-(--dashboard-foreground)`}
          >
            Temperature
          </h4>
          <div className="mt-4 flex items-center gap-3">
            <span
              className={`rounded-md bg-(--dashboard-button) px-2 py-1 text-sm font-bold text-(--dashboard-button-foreground) ${montserrat_paragraph.variable} font-montserratParagraph`}
            >
              {temperature.toFixed(1)}
            </span>
            <Slider
              aria-label="Temperature"
              value={[temperature]}
              onValueChange={(value) =>
                setTemperature(
                  Array.isArray(value) ? (value[0] ?? temperature) : value,
                )
              }
              min={0}
              max={1}
              step={0.1}
              trackClassName="bg-(--foreground-dark)"
              indicatorClassName="bg-(--dashboard-button)"
              thumbClassName="border-(--dashboard-background-dark) bg-(--dashboard-button)"
              className="flex-1"
            />
          </div>
        </div>

        <div
          className={`mt-4 flex gap-4 ${montserrat_paragraph.variable} font-montserratParagraph`}
        >
          <Switch
            checked={retrievalOnly}
            onCheckedChange={setRetrievalOnly}
            variant="labeled"
            label="Retrieval Only"
            tooltip="Retrieval Only bypasses the LLM call, making it free to retrieve relevant documents that match your prompt."
          />

          {selectedLanguage !== 'node' && (
            <Switch
              checked={streamEnabled}
              onCheckedChange={setStreamEnabled}
              variant="labeled"
              label="Stream Response"
            />
          )}
        </div>

        <div className="text-sm">
          <a
            href="https://docs.uiuc.chat/api/endpoints#image-input-example"
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--foreground) underline hover:text-(--dashboard-button-hover)"
          >
            Using image inputs (docs) →
          </a>
        </div>

        <Textarea
          value={codeSnippets[selectedLanguage]}
          readOnly
          aria-label="Code snippet"
          rows={codeSnippets[selectedLanguage].split('\n').length}
          className="relative mt-4 w-full min-w-0 resize-none overflow-x-auto rounded-xl border-0 bg-(--background) pl-4 font-mono text-sm text-(--foreground) shadow-none focus-visible:ring-0 sm:min-w-80 sm:pl-8 sm:text-base"
        />
      </div>
    </div>
  )
}
