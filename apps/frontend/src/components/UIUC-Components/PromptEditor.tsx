// PromptEditor.tsx - Shared component for prompt editing
// Used by both prompt.tsx page and StepPrompt wizard step
'use client'
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import Image from 'next/image'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'
import { Badge } from '@/components/shadcn/ui/badge'
import { Button } from '@/components/shadcn/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/shadcn/ui/collapsible'
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/shadcn/ui/dialog'
import { Separator } from '@/components/shadcn/ui/separator'
import { Switch } from '@/components/shadcn/ui/switch'
import { Textarea } from '@/components/shadcn/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconBook,
  IconChevronDown,
  IconExternalLink,
  IconInfoCircle,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconSparkles,
} from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { XIcon } from 'lucide-react'
import { useDebouncedCallback } from 'use-debounce'
import { v4 as uuidv4 } from 'uuid'
import CustomCopyButton from '~/components/Buttons/CustomCopyButton'
import { getModelLogo } from '~/components/Chat/ModelSelect'
import { LinkGeneratorModal } from '~/components/Modals/LinkGeneratorModal'
import { findDefaultModel } from '~/components/UIUC-Components/api-inputs/LLMsApiKeyInputForm'
import { type ChatBody } from '~/types/chat'
import { type CourseMetadata } from '~/types/courseMetadata'
import { callSetCourseMetadata, fetchCourseMetadata } from '~/utils/apiUtils'
import {
  CITATION_DISABLED_PROMPT,
  CITATION_GUIDELINES_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  DOCUMENT_FOCUS_PROMPT,
  GUIDED_LEARNING_PROMPT,
} from '~/utils/app/const'
import {
  recommendedModelIds,
  warningLargeModelIds,
} from '~/utils/modelProviders/ConfigWebLLM'
import {
  BedrockProvider,
  LLM_PROVIDER_ORDER,
  ProviderNames,
  ReasoningCapableModels,
  type AllLLMProviders,
  type AnySupportedModel,
} from '~/utils/modelProviders/LLMProvider'
import { type AnthropicModel } from '~/utils/modelProviders/types/anthropic'
import { showToast } from '~/utils/toastUtils'
import { LoadingSpinner } from './LoadingSpinner'
import { useQueryClient } from '@tanstack/react-query'

interface PromptEditorProps {
  project_name: string
  isEmbedded?: boolean // When true, shows a more compact version for wizard
  showHeader?: boolean // Whether to show the "Prompting / project_name" header
  userEmail?: string // User email for API calls
}

type PartialCourseMetadata = {
  [K in keyof CourseMetadata]?: CourseMetadata[K]
}

interface ModelOption {
  group: ProviderNames
  value: string
  label: string
  modelId: string
  selectedModelId: string
  modelType: string
  downloadSize?: string
  vram_required_MB?: number
  extendedThinking?: boolean
}

const getProviderFromModel = (
  modelId: string,
  modelOptions: ModelOption[],
): ProviderNames => {
  if (!modelId || !modelOptions.length) return ProviderNames.OpenAI
  const selectedOption = modelOptions.find((option) => option.value === modelId)
  return selectedOption?.group || ProviderNames.OpenAI
}

// Autosizing textarea: grows to fit its content, with the `max-h-*` class
// capping how far it can grow.
// Returns a ref plus a `height` to spread into the textarea's `style` prop,
// which also carries its font-family - so the height has to live in that prop
// too, not only on the element.
function useAutosizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const lastWidthRef = useRef<number | null>(null)
  const [height, setHeight] = useState<number>()

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const next = el.scrollHeight
    // Write the height back rather than clearing it: `setHeight` bails out on
    // an unchanged value, leaving the DOM with whatever was set here.
    el.style.height = `${next}px`
    lastWidthRef.current = el.clientWidth
    setHeight(next)
  }, [])

  // A plain `useRef` + `useEffect([value])` isn't enough here: this
  // component sets its state in two separate ticks on load (the prompt text
  // arrives, then `isLoading` flips false one microtask later, in a
  // `finally` after another awaited fetch). The textarea doesn't exist in
  // the DOM yet when `value` first changes, and by the time it mounts,
  // `value` hasn't changed again — so a value-keyed effect never re-fires
  // against the now-attached element. A callback ref sidesteps the race
  // entirely by measuring the instant the node actually attaches.
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      ref.current = node
      if (!node) return
      resize()
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          if (node.clientWidth !== lastWidthRef.current) resize()
        })
        observer.observe(node)
        observerRef.current = observer
      }
    },
    [resize],
  )

  // Re-measure on subsequent value changes (typing, or a swapped-in
  // optimized prompt) once the element is already mounted.
  useLayoutEffect(() => {
    resize()
  }, [value, resize])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return { ref: setRef, height }
}

const isApiKeyRequired = (provider: ProviderNames): boolean => {
  const providersRequiringApiKey = [
    ProviderNames.OpenAI,
    ProviderNames.Anthropic,
    ProviderNames.Azure,
    ProviderNames.Gemini,
    ProviderNames.Bedrock,
  ]
  return providersRequiringApiKey.includes(provider)
}

export const showPromptToast = (
  title: string,
  message: string,
  isError = false,
  icon?: React.ReactNode,
) => {
  // Calculate duration based on message length (minimum 5 seconds, add 1 second for every 20 characters)
  const baseDuration = 5000
  const durationPerChar = 50 // 50ms per character
  const duration = Math.max(
    baseDuration,
    Math.min(15000, message.length * durationPerChar),
  )

  showToast({
    title: title,
    message: message,
    type: isError ? 'error' : 'success',
    autoClose: duration,
    ...(icon ? { icon } : {}),
  })
}

export const showToastOnPromptUpdate = (was_error = false, isReset = false) => {
  const title = was_error
    ? 'Error Updating Prompt'
    : isReset
      ? 'Prompt Reset to Default'
      : 'Prompt Updated Successfully'
  const message = was_error
    ? 'An error occurred while updating the prompt. Please try again.'
    : isReset
      ? 'The system prompt has been reset to default settings.'
      : 'The system prompt has been updated.'
  const isError = was_error

  showPromptToast(title, message, isError)
}

export const showToastNotification = (
  title: string,
  message: string,
  isError = false,
) => {
  const baseDuration = 5000
  const durationPerChar = 50
  const duration = Math.max(
    baseDuration,
    Math.min(15000, message.length * durationPerChar),
  )

  showToast({
    title: title,
    message: message,
    type: isError ? 'error' : 'success',
    autoClose: duration,
  })
}

const PromptEditor: React.FC<PromptEditorProps> = ({
  project_name,
  isEmbedded = false,
  showHeader = true,
  userEmail,
}) => {
  const queryClient = useQueryClient()
  const isSmallScreen = useMediaQuery('(max-width: 1280px)')

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [courseMetadata, setCourseMetadata] = useState<CourseMetadata | null>(
    null,
  )
  const [baseSystemPrompt, setBaseSystemPrompt] = useState('')
  const { ref: systemPromptTextareaRef, height: systemPromptTextareaHeight } =
    useAutosizeTextarea(baseSystemPrompt)
  const [isRightSideVisible, setIsRightSideVisible] = useState(!isEmbedded)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [opened, setOpened] = useState(false)
  const open = useCallback(() => setOpened(true), [])
  const close = useCallback(() => setOpened(false), [])
  const [resetModalOpened, setResetModalOpened] = useState(false)
  const openResetModal = useCallback(() => setResetModalOpened(true), [])
  const closeResetModal = useCallback(() => setResetModalOpened(false), [])
  const [llmProviders, setLLMProviders] = useState<AllLLMProviders | null>(null)
  const [linkGeneratorOpened, setLinkGeneratorOpened] = useState(false)
  const openLinkGenerator = useCallback(() => setLinkGeneratorOpened(true), [])
  const closeLinkGenerator = useCallback(
    () => setLinkGeneratorOpened(false),
    [],
  )
  const [messages, setMessages] = useState<
    Array<{ role: string; content: string }>
  >([])
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)

  // Toggle states
  const [guidedLearning, setGuidedLearning] = useState(false)
  const [documentsOnly, setDocumentsOnly] = useState(false)
  const [disableCitations, setDisableCitations] = useState(false)
  const [systemPromptOnly, setSystemPromptOnly] = useState(false)
  const [vectorSearchRewrite, setVectorSearchRewrite] = useState(false)
  const [agentModeFeatureEnabled, setAgentModeFeatureEnabled] = useState(false)

  const courseMetadataRef = useRef<CourseMetadata | null>(null)
  const initialSwitchStateRef = useRef<{
    guidedLearning: boolean
    documentsOnly: boolean
    disableCitations: boolean
    systemPromptOnly: boolean
    vectorSearchRewrite: boolean
    agentModeFeatureEnabled: boolean
  }>({
    guidedLearning: false,
    documentsOnly: false,
    disableCitations: false,
    systemPromptOnly: false,
    vectorSearchRewrite: false,
    agentModeFeatureEnabled: false,
  })

  const removeThinkSections = (text: string): string => {
    const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/g, '')
    return cleanedText.replace(/<\/?think>/g, '').trim()
  }

  // Build model options from providers
  const modelOptions = llmProviders
    ? Object.entries(llmProviders as AllLLMProviders)
        // Sort by LLM_PROVIDER_ORDER
        .sort(([providerA], [providerB]) => {
          const indexA = LLM_PROVIDER_ORDER.indexOf(providerA as ProviderNames)
          const indexB = LLM_PROVIDER_ORDER.indexOf(providerB as ProviderNames)
          // Providers not in the order list will be placed at the end
          if (indexA === -1) return 1
          if (indexB === -1) return -1
          return indexA - indexB
        })
        .flatMap(([provider, config]) =>
          config.enabled && config.models && provider !== 'WebLLM'
            ? config.models
                .filter((model: AnySupportedModel) => model.enabled)
                .filter(
                  (model: AnySupportedModel) =>
                    model.id !== 'learnlm-1.5-pro-experimental',
                )
                .map((model: AnySupportedModel) => ({
                  group: provider as ProviderNames,
                  value: model.id,
                  label: model.name,
                  modelId: model.id,
                  selectedModelId: selectedModel,
                  modelType: provider,
                  // @ts-ignore -- this being missing is fine
                  downloadSize: model?.downloadSize,
                  // @ts-ignore -- this being missing is fine
                  vram_required_MB: model?.vram_required_MB,
                  extendedThinking:
                    (model as AnthropicModel)?.extendedThinking || false,
                }))
            : [],
        )
    : []

  // Grouped by provider for the model combobox — modelOptions is already
  // sorted by LLM_PROVIDER_ORDER with same-provider items contiguous, so a
  // simple adjacent-run grouping preserves that order.
  const groupedModelOptions = modelOptions.reduce<
    { value: string; items: ModelOption[] }[]
  >((groups, option) => {
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.value === option.group) {
      lastGroup.items.push(option)
    } else {
      groups.push({ value: option.group, items: [option] })
    }
    return groups
  }, [])

  const selectedModelOption =
    modelOptions.find((option) => option.value === selectedModel) ?? null

  // Fetch course metadata and providers on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!project_name) return

      try {
        // Check React Query cache first
        const cachedMetadata = queryClient.getQueryData([
          'courseMetadata',
          project_name,
        ]) as CourseMetadata | undefined

        let metadata: CourseMetadata | null = null
        if (cachedMetadata) {
          metadata = cachedMetadata
        } else {
          metadata = await fetchCourseMetadata(project_name)
          if (metadata) {
            queryClient.setQueryData(['courseMetadata', project_name], metadata)
          }
        }

        if (metadata) {
          setCourseMetadata(metadata)
          setBaseSystemPrompt(
            metadata.system_prompt ?? DEFAULT_SYSTEM_PROMPT ?? '',
          )
          setGuidedLearning(metadata.guidedLearning || false)
          setDocumentsOnly(metadata.documentsOnly || false)
          setDisableCitations(metadata.disableCitations || false)
          setSystemPromptOnly(metadata.systemPromptOnly || false)
          setVectorSearchRewrite(!metadata.vector_search_rewrite_disabled)
          setAgentModeFeatureEnabled(metadata.agent_mode_enabled ?? false)
          courseMetadataRef.current = metadata
          initialSwitchStateRef.current = {
            guidedLearning: metadata.guidedLearning || false,
            documentsOnly: metadata.documentsOnly || false,
            disableCitations: metadata.disableCitations || false,
            systemPromptOnly: metadata.systemPromptOnly || false,
            vectorSearchRewrite: !metadata.vector_search_rewrite_disabled,
            agentModeFeatureEnabled: metadata.agent_mode_enabled ?? false,
          }
        }

        // Fetch LLM providers
        const response = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: project_name }),
        })
        if (response.ok) {
          const providers = await response.json()
          setLLMProviders(providers)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [project_name, queryClient])

  // Set default model when providers load
  useEffect(() => {
    if (llmProviders) {
      const defaultModel = findDefaultModel(llmProviders)
      if (defaultModel) {
        setSelectedModel(defaultModel.id)
      }
    }
  }, [llmProviders])

  useEffect(() => {
    courseMetadataRef.current = courseMetadata
    if (courseMetadata) {
      initialSwitchStateRef.current = {
        guidedLearning: courseMetadata.guidedLearning || false,
        documentsOnly: courseMetadata.documentsOnly || false,
        disableCitations: courseMetadata.disableCitations || false,
        systemPromptOnly: courseMetadata.systemPromptOnly || false,
        vectorSearchRewrite: !courseMetadata.vector_search_rewrite_disabled,
        agentModeFeatureEnabled: courseMetadata.agent_mode_enabled ?? false,
      }
    }
  }, [courseMetadata])

  // Handle system prompt submission
  const handleSystemPromptSubmit = async (
    newSystemPrompt: string | undefined,
  ) => {
    let success = false
    if (courseMetadataRef.current && project_name) {
      const updatedCourseMetadata = {
        ...courseMetadataRef.current,
        system_prompt: newSystemPrompt,
        guidedLearning,
        documentsOnly,
        disableCitations,
        systemPromptOnly,
        agent_mode_enabled: agentModeFeatureEnabled,
      }
      success = await callSetCourseMetadata(project_name, updatedCourseMetadata)
      if (success) {
        setCourseMetadata(updatedCourseMetadata)
      }
    }
    if (!success) {
      console.log('Error updating course metadata')
      showToastOnPromptUpdate(true)
    } else {
      showToastOnPromptUpdate()
    }
  }

  // Reset system prompt
  const resetSystemPrompt = async () => {
    if (courseMetadata && project_name) {
      const updatedCourseMetadata = {
        ...courseMetadata,
        system_prompt: null,
        guidedLearning: false,
        documentsOnly: false,
        disableCitations: false,
        systemPromptOnly: false,
      }
      const success = await callSetCourseMetadata(
        project_name,
        updatedCourseMetadata,
      )
      if (!success) {
        alert('Error resetting system prompt')
        showToastOnPromptUpdate(true, true)
      } else {
        setBaseSystemPrompt(DEFAULT_SYSTEM_PROMPT ?? '')
        setCourseMetadata(updatedCourseMetadata)
        setGuidedLearning(false)
        setDocumentsOnly(false)
        setDisableCitations(false)
        setSystemPromptOnly(false)
        showToastOnPromptUpdate(false, true)
      }
    } else {
      alert('Error resetting system prompt')
    }
  }

  // Remove every occurrence of a snippet from the prompt (String.replace only
  // removes the first one).
  const removeAllOccurrences = (text: string, snippet: string) =>
    text.split(snippet).join('')

  // Update system prompt with toggle changes
  const updateSystemPrompt = (updatedFields: Partial<CourseMetadata>) => {
    let newPrompt = baseSystemPrompt

    // Handle Guided Learning prompt
    if (updatedFields.guidedLearning !== undefined) {
      if (updatedFields.guidedLearning) {
        if (!newPrompt.includes(GUIDED_LEARNING_PROMPT)) {
          newPrompt += GUIDED_LEARNING_PROMPT
        }
      } else {
        newPrompt = newPrompt.replace(GUIDED_LEARNING_PROMPT, '')
      }
    }

    // Handle Documents Only prompt
    if (updatedFields.documentsOnly !== undefined) {
      if (updatedFields.documentsOnly) {
        if (!newPrompt.includes(DOCUMENT_FOCUS_PROMPT)) {
          newPrompt += DOCUMENT_FOCUS_PROMPT
        }
      } else {
        newPrompt = newPrompt.replace(DOCUMENT_FOCUS_PROMPT, '')
      }
    }

    // Handle Disable citations prompt. The prompt always reflects the current
    // state of the toggle: exactly one of the two citation blocks is present,
    // and flipping the switch swaps them.
    if (updatedFields.disableCitations !== undefined) {
      const [remove, add] = updatedFields.disableCitations
        ? [CITATION_GUIDELINES_PROMPT, CITATION_DISABLED_PROMPT]
        : [CITATION_DISABLED_PROMPT, CITATION_GUIDELINES_PROMPT]

      newPrompt = removeAllOccurrences(newPrompt, remove)
      if (!newPrompt.includes(add)) {
        newPrompt += add
      }
    }

    return newPrompt
  }

  // Save settings with debounce
  const saveSettings = async () => {
    if (!courseMetadataRef.current || !project_name) return

    const currentSwitchState = {
      guidedLearning,
      documentsOnly,
      disableCitations,
      systemPromptOnly,
      vectorSearchRewrite,
      agentModeFeatureEnabled,
    }

    const initialSwitchState = initialSwitchStateRef.current

    const hasChanges = (
      Object.keys(currentSwitchState) as Array<keyof typeof currentSwitchState>
    ).some((key) => currentSwitchState[key] !== initialSwitchState[key])

    if (!hasChanges) {
      return
    }

    const updatedMetadata = {
      ...courseMetadataRef.current,
      guidedLearning,
      documentsOnly,
      disableCitations,
      systemPromptOnly,
      vector_search_rewrite_disabled: !vectorSearchRewrite,
      agent_mode_enabled: agentModeFeatureEnabled,
    } as CourseMetadata

    try {
      const success = await callSetCourseMetadata(project_name, updatedMetadata)
      if (!success) {
        showPromptToast('Error', 'Failed to update settings', true)
        return
      }

      setCourseMetadata(updatedMetadata)
      initialSwitchStateRef.current = currentSwitchState

      const changes: string[] = []
      if (
        initialSwitchState.vectorSearchRewrite !==
        currentSwitchState.vectorSearchRewrite
      ) {
        changes.push(
          `Smart Document Search ${
            currentSwitchState.vectorSearchRewrite ? 'enabled' : 'disabled'
          }`,
        )
      }
      if (
        initialSwitchState.guidedLearning !== currentSwitchState.guidedLearning
      ) {
        changes.push(
          `Guided Learning ${
            currentSwitchState.guidedLearning ? 'enabled' : 'disabled'
          }`,
        )
      }
      if (
        initialSwitchState.documentsOnly !== currentSwitchState.documentsOnly
      ) {
        changes.push(
          `Document-Based References Only ${
            currentSwitchState.documentsOnly ? 'enabled' : 'disabled'
          }`,
        )
      }
      if (
        initialSwitchState.disableCitations !==
        currentSwitchState.disableCitations
      ) {
        changes.push(
          `Hide citations in chat responses ${
            currentSwitchState.disableCitations ? 'enabled' : 'disabled'
          }`,
        )
      }
      if (
        initialSwitchState.systemPromptOnly !==
        currentSwitchState.systemPromptOnly
      ) {
        changes.push(
          `Bypass Illinois Chat's internal prompting ${
            currentSwitchState.systemPromptOnly ? 'enabled' : 'disabled'
          }`,
        )
      }
      if (
        initialSwitchState.agentModeFeatureEnabled !==
        currentSwitchState.agentModeFeatureEnabled
      ) {
        changes.push(
          `Agent Mode ${
            currentSwitchState.agentModeFeatureEnabled ? 'enabled' : 'disabled'
          }`,
        )
      }

      if (changes.length > 0) {
        showPromptToast(
          changes.join(' & '),
          'Settings have been saved successfully',
          false,
        )
      }
    } catch (error) {
      console.error('Error updating course settings:', error)
      showPromptToast('Error', 'Failed to update settings', true)
    }
  }

  const debouncedSaveSettings = useDebouncedCallback(saveSettings, 500)

  const handleCheckboxChange = async (updatedFields: PartialCourseMetadata) => {
    if (!courseMetadata || !project_name) {
      showPromptToast('Error', 'Failed to update settings', true)
      return
    }

    if ('guidedLearning' in updatedFields)
      setGuidedLearning(updatedFields.guidedLearning!)
    if ('documentsOnly' in updatedFields)
      setDocumentsOnly(updatedFields.documentsOnly!)
    if ('disableCitations' in updatedFields)
      setDisableCitations(updatedFields.disableCitations!)
    if ('systemPromptOnly' in updatedFields)
      setSystemPromptOnly(updatedFields.systemPromptOnly!)

    const newSystemPrompt = updateSystemPrompt(updatedFields)
    setBaseSystemPrompt(newSystemPrompt)

    courseMetadataRef.current = {
      ...courseMetadataRef.current!,
      ...updatedFields,
      system_prompt: newSystemPrompt,
    } as CourseMetadata

    debouncedSaveSettings()
  }

  const handleSettingChange = (updates: PartialCourseMetadata) => {
    if (!courseMetadata) return

    if ('vector_search_rewrite_disabled' in updates) {
      setVectorSearchRewrite(!updates.vector_search_rewrite_disabled)
    }
    if ('agent_mode_enabled' in updates) {
      setAgentModeFeatureEnabled(updates.agent_mode_enabled ?? false)
    }

    courseMetadataRef.current = {
      ...courseMetadataRef.current!,
      ...updates,
    } as CourseMetadata

    debouncedSaveSettings()
  }

  const handleCopyDefaultPrompt = async () => {
    try {
      const response = await fetch('/api/getDefaultPostPrompt')
      if (!response.ok) {
        const errorMessage = `Failed to fetch default prompt: ${response.status} ${response.statusText}`
        console.error(errorMessage)
        throw new Error(errorMessage)
      }
      const data = await response.json()
      const defaultPostPrompt = data.prompt

      navigator.clipboard
        .writeText(defaultPostPrompt)
        .then(() => {
          showPromptToast(
            'Copied',
            'Default post prompt system prompt copied to clipboard',
          )
        })
        .catch((err) => {
          console.error('Could not copy text: ', err)
          showPromptToast(
            'Error Copying',
            'Could not copy text to clipboard',
            true,
          )
        })
    } catch (error) {
      console.error('Error fetching default prompt:', error)
      showPromptToast('Error Fetching', 'Could not fetch default prompt', true)
    }
  }

  // Handle prompt optimization
  const handleSubmitPromptOptimization = async (e: any) => {
    e.preventDefault()
    setIsOptimizing(true)
    setMessages([])

    try {
      if (!llmProviders) {
        showPromptToast(
          'Configuration Error',
          'The Optimize System Prompt feature requires provider configuration to be loaded. Please refresh the page and try again.',
          true,
        )
        return
      }

      const provider = getProviderFromModel(selectedModel, modelOptions)
      if (!llmProviders[provider]?.enabled) {
        showPromptToast(
          `${provider} Required`,
          `The Optimize System Prompt feature requires ${provider} to be enabled. Please enable ${provider} on the LLM page in your course settings to use this feature.`,
          true,
        )
        return
      }

      if (isApiKeyRequired(provider)) {
        if (provider === 'Bedrock') {
          const bedrockProvider = llmProviders[provider] as BedrockProvider
          if (
            !bedrockProvider?.accessKeyId ||
            !bedrockProvider?.secretAccessKey ||
            !bedrockProvider?.region
          ) {
            showPromptToast(
              `${provider} Credentials Required`,
              `The Optimize System Prompt feature requires AWS credentials (Access Key ID, Secret Access Key, and Region). Please add your AWS credentials on the LLM page in your course settings to use this feature.`,
              true,
            )
            return
          }
        } else if (!llmProviders[provider]?.apiKey) {
          showPromptToast(
            `${provider} API Key Required`,
            `The Optimize System Prompt feature requires a ${provider} API key. Please add your ${provider} API key on the LLM page in your course settings to use this feature.`,
            true,
          )
          return
        }
      }
      const systemPrompt = `You are an expert prompt engineer specializing in optimizing prompts with the ability to handle various different use cases. Your task is to analyze and enhance the provided system prompt while preserving its core functionality and improving its effectiveness.

Key Objectives:

1. Core Functionality Analysis:
   - Identify the primary purpose and key behaviors specified in the prompt
   - Determine if the prompt involves document/RAG interactions
   - Recognize any special modes (e.g., guided learning, document-only)
   - Map out any specific output format requirements

2. Educational Enhancement:
   - Strengthen pedagogical elements if present
   - Add clear reasoning steps where appropriate
   - Ensure explanations precede conclusions
   - Maintain academic integrity guidelines if specified

3. RAG Integration (OPTIONAL, ONLY IF APPLICABLE):
   - Optimize document reference and citation patterns
   - Enhance context retrieval instructions
   - Improve document summarization guidelines
   - Add safeguards against hallucination

4. Prompt Structure Optimization:
   - Organize instructions in a clear, logical flow
   - Remove redundancy while preserving distinct requirements
   - Add explicit step-by-step breakdowns where helpful
   - Create smooth transitions between different behaviors

5. Output Quality Assurance:
   - Specify clear formatting requirements
   - Add validation steps for responses
   - Include error handling guidelines
   - Define success criteria

6. Behavioral Calibration:
   - Adjust tone and formality to match educational context
   - Balance helpfulness with academic integrity
   - Maintain consistent personality throughout interactions
   - Preserve any specific behavioral constraints

7. Technical Requirements:
   - Keep all special syntax and formatting intact
   - Preserve any API-specific formatting
   - Maintain compatibility with Illinois Chat's citation system (OPTIONAL, ONLY IF APPLICABLE and mentioned in the original prompt)
   - Ensure proper handling of code blocks and markdown

Output Format:
Return ONLY the optimized system prompt with no additional commentary. The prompt should follow this structure:
1. Core role and purpose statement
2. Primary behavioral guidelines
3. Document interaction rules (OPTIONAL, ONLY IF APPLICABLE)
4. Step-by-step instruction flow
5. Output format requirements
6. Special mode handling (OPTIONAL, ONLY IF APPLICABLE)

CRITICAL: The optimized prompt must:
- Preserve ALL core functionality from the original
- Enhance clarity and effectiveness
- Maintain compatibility with Illinois Chat's features (OPTIONAL, ONLY IF APPLICABLE and mentioned in the original prompt)
- Support both RAG and non-RAG interactions appropriately
- Keep any existing citation or formatting requirements
- SHOULD NOT MENTION SPECIAL MODE HANDLING OR OPTIONAL SECTIONS IF THEY ARE NOT EXPLICITLY PRESENT IN THE ORIGINAL PROMPT
- be concise and NOT include any special mode handling or optional sections unless they are explicitly present in the original prompt`

      const chatBody: ChatBody = {
        conversation: {
          id: uuidv4(),
          name: 'Prompt Optimization',
          messages: [
            {
              id: uuidv4(),
              role: 'system',
              content: systemPrompt,
            },
            {
              id: uuidv4(),
              role: 'user',
              content: baseSystemPrompt,
            },
          ],
          model: {
            id: selectedModel || 'gpt-5.4-mini',
            name:
              modelOptions.find((opt) => opt.value === selectedModel)?.label ||
              'GPT-5.4 Mini',
            tokenLimit: 400000,
            enabled: true,
            extendedThinking:
              modelOptions.find((opt) => opt.value === selectedModel)
                ?.extendedThinking || false,
          },
          prompt: baseSystemPrompt,
          temperature: 0.1,
          folderId: null,
          userEmail: userEmail,
        },
        llmProviders: llmProviders,
        course_name: project_name,
        mode: 'optimize_prompt',
        stream: true,
        key: '',
      }

      const response = await fetch('/api/allNewRoutingChat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
        showPromptToast(
          'Error',
          errorData.error || 'Failed to optimize prompt',
          true,
        )
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No reader available')
      }

      let optimizedPrompt = ''
      const decoder = new TextDecoder()
      let isFirstChunk = true

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        optimizedPrompt += chunk

        // Open modal and update UI state on first chunk of content
        if (isFirstChunk && chunk.trim()) {
          isFirstChunk = false
          open()
          setIsOptimizing(false)
        }

        // Check if we're using a model that supports thinking tags
        // Process the optimized prompt to remove <think> sections if using DeepSeek
        const processedPrompt = ReasoningCapableModels.has(selectedModel as any)
          ? removeThinkSections(optimizedPrompt)
          : optimizedPrompt

        // Update messages state for real-time display
        setMessages([{ role: 'assistant', content: processedPrompt }])
      }
    } catch (error) {
      console.error('Error optimizing prompt:', error)
      showPromptToast(
        'Error',
        'Failed to optimize prompt. Please try again.',
        true,
      )
    } finally {
      setIsOptimizing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-(--foreground-faded)">Loading...</p>
      </div>
    )
  }

  return (
    <div className="prompt-editor">
      <div
        className={`flex ${isSmallScreen || isEmbedded ? 'flex-col' : 'flex-row'}`}
      >
        {/* Left Side - Main Content */}
        <div
          className={`min-h-full bg-(--background) ${
            isEmbedded ? 'w-full' : 'flex-[1_1_60%]'
          }`}
        >
          {showHeader && !isEmbedded && (
            <div className="w-full px-4 py-3 sm:px-6 sm:py-4 md:px-8">
              <div className="flex items-center gap-2">
                <h2
                  className={`heading-h2 ${montserrat_heading.variable} font-montserratHeading text-lg text-(--foreground) sm:text-2xl`}
                >
                  Prompting
                </h2>
                <span className="text-(--foreground)">/</span>
                <h3
                  className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading text-base text-(--illinois-orange) sm:text-xl`}
                >
                  {project_name}
                </h3>
              </div>
            </div>
          )}

          <div className={`${isEmbedded ? '' : 'p-4'}`}>
            {/* Prompt Engineering Guide */}
            <Collapsible
              open={insightsOpen}
              onOpenChange={setInsightsOpen}
              className="w-full rounded-xl bg-(--dashboard-background-faded) px-6 py-4 transition-all duration-200"
            >
              <CollapsibleTrigger
                nativeButton={false}
                render={
                  <div className="flex w-full cursor-pointer items-center justify-between rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--dashboard-button)" />
                }
              >
                <div className="flex items-center gap-4">
                  <IconBook
                    size={24}
                    aria-hidden="true"
                    className="text-(--dashboard-button)"
                  />
                  <h4
                    className={`heading-h4 py-2 ${montserrat_heading.variable} font-montserratHeading pr-0 pl-1 text-(--dashboard-foreground) md:pr-2 md:pl-0`}
                  >
                    Prompt Engineering Guide
                  </h4>
                </div>
                <div
                  className={`flex items-center justify-center text-(--dashboard-foreground) transition-transform duration-200 ${
                    insightsOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                >
                  <IconChevronDown size={24} aria-hidden="true" />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="mt-4 px-2 text-(--dashboard-foreground)">
                  <div
                    className={`${montserrat_paragraph.variable} font-montserratParagraph text-base select-text`}
                  >
                    For additional insights and best practices on prompt
                    creation, please review:
                    <ul className="mt-2 list-none space-y-2 pl-5">
                      <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-(--dashboard-foreground)">
                        <a
                          className={`text-sm text-(--dashboard-button) transition-colors duration-200 hover:text-(--dashboard-button-hover) ${montserrat_paragraph.variable} font-montserratParagraph`}
                          href="https://platform.openai.com/docs/guides/prompt-engineering"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          The Official OpenAI Prompt Engineering Guide
                          <IconExternalLink
                            size={18}
                            aria-hidden="true"
                            className="relative -top-0.5 inline-block pl-1"
                          />
                        </a>
                      </li>
                      <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-(--dashboard-foreground)">
                        <a
                          className={`text-sm text-(--dashboard-button) transition-colors duration-200 hover:text-(--dashboard-button-hover) ${montserrat_paragraph.variable} font-montserratParagraph`}
                          href="https://docs.anthropic.com/claude/prompt-library"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          The Official Anthropic Prompt Library
                          <IconExternalLink
                            size={18}
                            aria-hidden="true"
                            className="relative -top-0.5 inline-block pl-1"
                          />
                        </a>
                      </li>
                    </ul>
                  </div>
                  <div
                    className={`px-1 py-2 ${montserrat_paragraph.variable} font-montserratParagraph mt-6 inline-block text-base select-text`}
                  >
                    The System Prompt provides the foundation for every
                    conversation in this project. It defines the model&apos;s
                    role, tone, and behavior. Consider including:
                    <ul className="mt-2 list-none space-y-1 pl-5 text-(--dashboard-foreground)">
                      <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-(--dashboard-foreground)">
                        Key instructions or examples
                      </li>
                      <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-(--dashboard-foreground)">
                        A warm welcome message
                      </li>
                      <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-(--dashboard-foreground)">
                        Helpful links for further learning
                      </li>
                    </ul>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* System Prompt Section */}
            <div className="mt-4 flex w-full flex-col rounded-xl bg-(--dashboard-background-faded) px-4 py-6 sm:p-6">
              <div className="mb-4 flex w-full items-center justify-between">
                <div className="-mt-2 flex items-center gap-4">
                  <h4
                    className={`heading-h4 py-2 ${montserrat_heading.variable} font-montserratHeading pr-0 pl-1 text-(--dashboard-foreground) md:pr-2 md:pl-0`}
                  >
                    System Prompt
                  </h4>
                  <Combobox
                    items={groupedModelOptions}
                    value={selectedModelOption}
                    isItemEqualToValue={(item, val) =>
                      (item as ModelOption | null)?.value ===
                      (val as ModelOption | null)?.value
                    }
                    onValueChange={(item) => {
                      const selected = item as ModelOption | null
                      setSelectedModel(selected?.value || '')
                    }}
                  >
                    <ComboboxInputGroup className="w-[220px] cursor-pointer border-(--button) bg-(--background) text-(--foreground) focus-within:border-(--dashboard-button) sm:w-[240px] md:w-[320px]">
                      {selectedModelOption && (
                        <Image
                          aria-hidden="true"
                          src={getModelLogo(selectedModelOption.modelType)}
                          alt={`${selectedModelOption.modelType} logo`}
                          width={20}
                          height={20}
                          className="min-w-5 overflow-hidden rounded"
                        />
                      )}
                      <ComboboxInput
                        placeholder="Select model"
                        aria-label="Select model"
                        className={`${montserrat_paragraph.variable} font-montserratParagraph cursor-pointer text-sm`}
                      />
                      <ComboboxTrigger className="text-(--foreground-faded)">
                        <IconChevronDown
                          size={isSmallScreen ? 12 : 14}
                          aria-hidden="true"
                        />
                      </ComboboxTrigger>
                    </ComboboxInputGroup>
                    <ComboboxContent className="rounded-md border border-(--background-dark) bg-(--background) text-(--foreground) shadow-xs">
                      <ComboboxEmpty>Nothing found</ComboboxEmpty>
                      <ComboboxList>
                        {(group: { value: string; items: ModelOption[] }) => (
                          <ComboboxGroup key={group.value} items={group.items}>
                            <ComboboxGroupLabel>
                              {group.value}
                            </ComboboxGroupLabel>
                            <ComboboxCollection>
                              {(item: ModelOption) => (
                                <ComboboxItem
                                  key={item.value}
                                  value={item}
                                  className={`${montserrat_paragraph.variable} font-montserratParagraph text-sm text-(--foreground) data-highlighted:bg-(--foreground-faded)`}
                                >
                                  <div className="w-full pl-1">
                                    <div className="flex items-center">
                                      <Image
                                        aria-hidden="true"
                                        src={getModelLogo(item.modelType)}
                                        alt={`${item.modelType} logo`}
                                        width={20}
                                        height={20}
                                        className="min-w-5 overflow-hidden rounded"
                                      />
                                      <span className="ml-3 text-sm">
                                        {item.label}
                                      </span>
                                    </div>
                                    {item.downloadSize && (
                                      <div className="mt-1 ml-8 flex items-center">
                                        <span className="text-xs opacity-65">
                                          {item.downloadSize}
                                        </span>
                                        {recommendedModelIds.includes(
                                          item.label,
                                        ) && (
                                          <div className="flex items-center">
                                            <IconSparkles
                                              size="1rem"
                                              aria-hidden="true"
                                              className="ml-2"
                                            />
                                            <span className="ml-1 text-xs opacity-65">
                                              recommended
                                            </span>
                                          </div>
                                        )}
                                        {warningLargeModelIds.includes(
                                          item.label,
                                        ) && (
                                          <div className="flex items-center">
                                            <IconAlertTriangleFilled
                                              size="1rem"
                                              aria-hidden="true"
                                              className="ml-2"
                                            />
                                            <span className="ml-1 text-xs opacity-65">
                                              warning, requires large vRAM GPU
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </ComboboxItem>
                              )}
                            </ComboboxCollection>
                          </ComboboxGroup>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <Tooltip>
                    <TooltipTrigger render={<div />}>
                      <IconInfoCircle
                        size={18}
                        aria-hidden="true"
                        className="cursor-pointer text-(--foreground-faded) transition-colors duration-200 hover:text-(--foreground)"
                      />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px] text-wrap">
                      The selected model will be used when Optimizing System
                      Prompt
                    </TooltipContent>
                  </Tooltip>
                </div>

                {!isEmbedded && (
                  <>
                    {isRightSideVisible ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              className="cursor-pointer border-none bg-transparent p-0 pl-2"
                              data-right-sidebar-icon
                              aria-label="Close Prompt Builder"
                              onClick={() => setIsRightSideVisible(false)}
                            />
                          }
                        >
                          <IconLayoutSidebarRight
                            stroke={2}
                            aria-hidden="true"
                            className="text-(--foreground-faded) transition-colors duration-200 hover:text-(--foreground)"
                          />
                        </TooltipTrigger>
                        <TooltipContent>Close Prompt Builder</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              className="mr-2 cursor-pointer border-none bg-transparent p-0"
                              data-right-sidebar-icon
                              aria-label="Open Prompt Builder"
                              onClick={() => setIsRightSideVisible(true)}
                            />
                          }
                        >
                          <IconLayoutSidebarRightExpand
                            stroke={2}
                            aria-hidden="true"
                            className="text-(--foreground-faded) transition-colors duration-200 hover:text-(--foreground)"
                          />
                        </TooltipTrigger>
                        <TooltipContent>Open Prompt Builder</TooltipContent>
                      </Tooltip>
                    )}
                  </>
                )}
              </div>

              <form
                className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                onSubmit={handleSubmitPromptOptimization}
              >
                <Textarea
                  ref={systemPromptTextareaRef}
                  placeholder="Enter the system prompt..."
                  aria-label="System Prompt"
                  className="max-h-96 w-full resize-y overflow-y-auto bg-(--background) px-3 pt-3 text-(--foreground) focus-visible:border-(--dashboard-button)"
                  style={{
                    fontFamily: 'var(--font-montserratParagraph)',
                    height: systemPromptTextareaHeight
                      ? `${systemPromptTextareaHeight}px`
                      : undefined,
                  }}
                  rows={isEmbedded ? 4 : 3}
                  value={baseSystemPrompt}
                  onChange={(e) => setBaseSystemPrompt(e.target.value)}
                />

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="dashboard"
                    className={`min-w-fit rounded-md px-5 py-2.5 shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all duration-200 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] active:shadow-[0_2px_4px_rgba(0,0,0,0.2)] ${montserrat_paragraph.variable} font-montserratParagraph`}
                    type="button"
                    onClick={() => handleSystemPromptSubmit(baseSystemPrompt)}
                  >
                    Update System Prompt
                  </Button>

                  <span
                    style={
                      {
                        '--spinner': 'var(--dashboard-button)',
                      } as React.CSSProperties
                    }
                  >
                    <Button
                      onClick={handleSubmitPromptOptimization}
                      disabled={!llmProviders || isOptimizing}
                      variant="dashboard"
                      className={`min-w-fit gap-2 rounded-md px-5 py-2.5 transition-all duration-200 disabled:transform-none disabled:opacity-70 ${montserrat_paragraph.variable} font-montserratParagraph`}
                    >
                      {isOptimizing ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <IconSparkles stroke={1} aria-hidden="true" />
                      )}
                      {isOptimizing
                        ? 'Optimizing...'
                        : 'Optimize System Prompt'}
                    </Button>
                  </span>
                </div>
              </form>
            </div>

            {/* Optimization Modal */}
            <Dialog open={opened} onOpenChange={(next) => !next && close()}>
              <DialogContent
                showCloseButton={false}
                className={`flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-xl border border-[#2D2F48] bg-(--modal) p-0 text-(--modal-text) sm:max-w-[788px] ${montserrat_heading.variable} font-montserratHeading`}
              >
                <div className="flex items-center justify-between border-b border-(--modal-border) px-6 py-5">
                  <DialogTitle className="text-lg font-bold">
                    Optimized System Prompt
                  </DialogTitle>
                  <DialogClose
                    aria-label="Close"
                    className="text-(--modal-text) hover:bg-(--dashboard-button) hover:text-(--modal)"
                  >
                    <XIcon className="size-4" aria-hidden="true" />
                  </DialogClose>
                </div>
                <div
                  className="mt-[2%] flex min-h-0 flex-1 flex-col gap-6 p-6 pt-[4%]"
                  style={{ maxHeight: 'calc(85vh - 76px)' }}
                >
                  <div
                    className="mt-1 min-h-[200px] flex-1 overflow-auto rounded-md bg-(--background-faded) p-4"
                    style={{ maxHeight: 'calc(85vh - 200px)' }}
                  >
                    {messages.map((message, i, { length }) => {
                      if (length - 1 === i && message.role === 'assistant') {
                        return (
                          <div
                            key={i}
                            style={{
                              padding: '16px',
                              borderRadius: '8px',
                              whiteSpace: 'pre-wrap',
                              color: 'var(--modal-text)',
                              lineHeight: '1.6',
                              fontSize: '0.95rem',
                            }}
                            className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                          >
                            {message.content}
                          </div>
                        )
                      }
                      return null
                    })}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={close}
                      className={`rounded-md border-(--background-faded) text-(--foreground) hover:bg-(--background-faded) ${montserrat_paragraph.variable} font-montserratParagraph`}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="dashboard"
                      className={`rounded-md px-5 py-2.5 transition-all duration-200 ${montserrat_paragraph.variable} font-montserratParagraph`}
                      onClick={() => {
                        const lastMessage = messages[messages.length - 1]
                        if (lastMessage && lastMessage.role === 'assistant') {
                          const newSystemPrompt = lastMessage.content
                          setBaseSystemPrompt(newSystemPrompt)
                          handleSystemPromptSubmit(newSystemPrompt)
                        }
                        close()
                      }}
                    >
                      Update System Prompt
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Behavior Settings - shown inline when embedded */}
            {isEmbedded && (
              <div className="mt-6 rounded-xl bg-(--dashboard-background-faded) p-4 sm:p-6">
                <h4
                  className={`heading-h4 ${montserrat_heading.variable} font-montserratHeading mb-4 text-(--foreground)`}
                >
                  AI Behavior Settings
                </h4>

                <div className="flex flex-col gap-4">
                  <Switch
                    size="lg"
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Smart Document Search"
                    tooltip="Optimizes queries to better search through course materials."
                    checked={vectorSearchRewrite}
                    onCheckedChange={(value: boolean) => {
                      handleSettingChange({
                        vector_search_rewrite_disabled: !value,
                      })
                    }}
                  />

                  <Switch
                    size="lg"
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Guided Learning"
                    tooltip="AI provides hints instead of direct answers to encourage learning."
                    checked={guidedLearning}
                    onCheckedChange={(value: boolean) =>
                      handleCheckboxChange({ guidedLearning: value })
                    }
                  />

                  <Switch
                    size="lg"
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Document-Based References Only"
                    tooltip="Restricts AI to only use information from provided documents."
                    checked={documentsOnly}
                    onCheckedChange={(value: boolean) =>
                      handleCheckboxChange({ documentsOnly: value })
                    }
                  />

                  <Switch
                    size="lg"
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Hide citations in chat responses"
                    tooltip="Disables the display of citations and sources on the chat screen."
                    checked={disableCitations}
                    onCheckedChange={(value: boolean) =>
                      handleCheckboxChange({ disableCitations: value })
                    }
                  />

                  <Switch
                    size="lg"
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Bypass Illinois Chat's internal prompting"
                    tooltip="Full control over bot behavior without internal prompting."
                    checked={systemPromptOnly}
                    onCheckedChange={(value: boolean) =>
                      handleCheckboxChange({ systemPromptOnly: value })
                    }
                  />

                  <Switch
                    size="lg"
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Enable Agent Mode"
                    tooltip="Runs a multi-step server-side agent loop that can iteratively search documents and execute tools before generating the final answer."
                    checked={agentModeFeatureEnabled}
                    onCheckedChange={(value: boolean) =>
                      handleSettingChange({ agent_mode_enabled: value })
                    }
                  />

                  {systemPromptOnly && (
                    <div className="ml-[82px]">
                      <CustomCopyButton
                        label="Copy Illinois Chat's internal prompt"
                        tooltip="Get our default internal prompting as a starting point."
                        onClick={handleCopyDefaultPrompt}
                      />
                    </div>
                  )}

                  {/* Reset Modal for embedded mode */}
                  <Dialog
                    open={resetModalOpened}
                    onOpenChange={(next) => !next && closeResetModal()}
                  >
                    <DialogContent
                      showCloseButton={false}
                      className={`gap-0 rounded-md border border-[#2D2F48] bg-(--illinois-purple-dark) p-0 text-white sm:max-w-md ${montserrat_heading.variable} font-montserratHeading`}
                    >
                      <div className="mb-4 flex items-center justify-between border-b border-[#2D2F48] px-6 py-5">
                        <DialogTitle
                          className="bg-clip-text text-lg font-bold text-transparent"
                          style={{
                            backgroundImage:
                              'linear-gradient(45deg, red, white)',
                          }}
                        >
                          Reset Prompting Settings
                        </DialogTitle>
                        <DialogClose
                          aria-label="Close"
                          className="mt-1 text-white"
                        >
                          <XIcon className="size-4" aria-hidden="true" />
                        </DialogClose>
                      </div>
                      <div className="flex flex-col gap-6 px-6 pb-6">
                        <div className="flex items-start gap-4">
                          <IconAlertTriangle
                            size={24}
                            aria-hidden="true"
                            className="mt-0.5 text-red-500"
                          />
                          <p
                            className={`${montserrat_paragraph.variable} font-montserratParagraph text-sm leading-relaxed font-medium text-white`}
                          >
                            Are you sure you want to reset your system prompt
                            and all behavior settings to their default values?
                          </p>
                        </div>

                        <Separator className="bg-white/10" />

                        <div>
                          <p
                            className={`${montserrat_paragraph.variable} font-montserratParagraph mb-3 text-sm font-semibold text-[#D1D1D1]`}
                          >
                            This action will:
                          </p>
                          <ul className="list-none space-y-2 pl-5 text-sm text-[#D1D1D1]">
                            <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-red-400">
                              Restore the system prompt to the default template
                            </li>
                            <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-red-400">
                              Disable Guided Learning, Document-Only mode, and
                              other custom settings
                            </li>
                          </ul>
                        </div>

                        <p
                          className={`${montserrat_paragraph.variable} font-montserratParagraph text-sm text-[#D1D1D1]`}
                        >
                          This cannot be undone. Please confirm you wish to
                          proceed.
                        </p>

                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={closeResetModal}
                            className={`rounded-md border-gray-600 text-white hover:bg-gray-800 ${montserrat_paragraph.variable} font-montserratParagraph`}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="danger"
                            className={`rounded-md bg-red-800 px-5 py-2.5 shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all duration-200 hover:bg-red-900 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] active:translate-y-0 ${montserrat_paragraph.variable} font-montserratParagraph`}
                            onClick={() => {
                              resetSystemPrompt()
                              closeResetModal()
                            }}
                          >
                            Confirm
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Action Buttons */}
                  <Separator className="my-4" />
                  <div className="flex flex-col gap-4">
                    <Button
                      variant="danger"
                      className={`gap-2 rounded-md bg-red-800 px-5 py-2.5 transition-all duration-200 hover:bg-red-900 ${montserrat_paragraph.variable} font-montserratParagraph`}
                      onClick={openResetModal}
                    >
                      <IconAlertTriangle size={16} aria-hidden="true" />
                      Reset Prompting Settings
                    </Button>

                    <Button
                      variant="dashboard"
                      className={`gap-2 rounded-md px-5 py-2.5 transition-all duration-200 ${montserrat_paragraph.variable} font-montserratParagraph`}
                      onClick={openLinkGenerator}
                    >
                      <IconLink size={16} aria-hidden="true" />
                      Generate Share Link
                    </Button>
                  </div>

                  {/* Link Generator Modal for embedded mode */}
                  <LinkGeneratorModal
                    opened={linkGeneratorOpened}
                    onClose={closeLinkGenerator}
                    course_name={project_name}
                    currentSettings={{
                      guidedLearning,
                      documentsOnly,
                      systemPromptOnly,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Settings Sidebar (not shown in embedded mode) */}
        {!isEmbedded && isRightSideVisible && courseMetadata && (
          <div
            className="flex-[1_1_40%]"
            style={{
              padding: '1rem',
              color: 'var(--dashboard-foreground)',
              backgroundColor: 'var(--dashboard-sidebar-background)',
              borderLeft: '1px solid var(--dashboard-border)',
            }}
          >
            <div className="m-4 flex flex-col gap-4">
              <div className="flex items-start">
                <h3
                  className={`heading-h3 ${montserrat_heading.variable} font-montserratHeading -ml-[11px] self-start px-4 pt-4 pb-1`}
                >
                  Document Search Optimization
                </h3>
                <span className="relative inline-block">
                  <Badge
                    className={`${montserrat_heading.variable} font-montserratHeading absolute rounded-md bg-(--dashboard-button) px-1.5 py-0 text-[10px] text-(--dashboard-button-foreground)`}
                    style={{ top: '-1.1rem', right: '.25rem' }}
                  >
                    New
                  </Badge>
                </span>
              </div>

              <Switch
                variant="labeled"
                showLabels
                showThumbIcon
                label="Smart Document Search"
                tooltip="When enabled, Illinois Chat optimizes your queries to better search through course materials and find relevant content. Note: This only affects how documents are searched - your chat messages remain exactly as you write them."
                checked={vectorSearchRewrite}
                onCheckedChange={(value: boolean) => {
                  handleSettingChange({
                    vector_search_rewrite_disabled: !value,
                  })
                }}
              />

              <Separator />

              <div className="flex items-start pt-[15px]">
                <h3
                  className={`heading-h3 px-1 py-2 ${montserrat_heading.variable} font-montserratHeading mr-[8px]`}
                >
                  AI Behavior Settings
                </h3>
                <Badge
                  className={`${montserrat_heading.variable} font-montserratHeading mt-1 rounded-md bg-(--dashboard-button) px-1.5 py-0 text-[10px] text-(--dashboard-button-foreground)`}
                >
                  New
                </Badge>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <Switch
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Guided Learning"
                    tooltip="When enabled course-wide, this setting applies to all students and cannot be disabled by them. The AI will encourage independent problem-solving by providing hints and questions instead of direct answers, while still finding and citing relevant course materials. This promotes critical thinking while ensuring students have access to proper resources."
                    checked={guidedLearning}
                    onCheckedChange={(value: boolean) =>
                      handleCheckboxChange({ guidedLearning: value })
                    }
                  />

                  <Switch
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Document-Based References Only"
                    tooltip="Restricts the AI to use only information from the provided documents. Useful for maintaining accuracy in fields like legal research where external knowledge could be problematic."
                    checked={documentsOnly}
                    onCheckedChange={(value: boolean) =>
                      handleCheckboxChange({ documentsOnly: value })
                    }
                  />

                  <Switch
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Hide citations in chat responses"
                    tooltip="Disables the display of citations and sources on the chat screen."
                    checked={disableCitations}
                    onCheckedChange={(value: boolean) =>
                      handleCheckboxChange({ disableCitations: value })
                    }
                  />

                  <Switch
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Bypass Illinois Chat's internal prompting"
                    tooltip="Internally, we prompt the model to (1) add citations and (2) always be as helpful as possible. You can bypass this for full un-modified control over your bot."
                    checked={systemPromptOnly}
                    onCheckedChange={(value: boolean) =>
                      handleCheckboxChange({ systemPromptOnly: value })
                    }
                  />

                  <Switch
                    variant="labeled"
                    showLabels
                    showThumbIcon
                    label="Enable Agent Mode"
                    tooltip="Enables the Agent Mode feature for this project. Agent Mode runs a multi-step server-side loop that can iteratively search documents and execute tools before generating the final answer."
                    checked={agentModeFeatureEnabled}
                    onCheckedChange={(value: boolean) =>
                      handleSettingChange({ agent_mode_enabled: value })
                    }
                  />

                  {systemPromptOnly && (
                    <div className="mt-[-4px] flex flex-col gap-1 pl-[82px]">
                      <CustomCopyButton
                        label="Copy Illinois Chat's internal prompt"
                        tooltip="You can use and customize our default internal prompting to suit your needs. Note, only the specific citation formatting described will work with our citation 'find and replace' system. This provides a solid starting point for defining AI behavior in raw prompt mode."
                        onClick={handleCopyDefaultPrompt}
                      />
                    </div>
                  )}

                  {/* Reset Modal */}
                  <Dialog
                    open={resetModalOpened}
                    onOpenChange={(next) => !next && closeResetModal()}
                  >
                    <DialogContent
                      showCloseButton={false}
                      className={`gap-0 rounded-md border border-[#2D2F48] bg-(--illinois-purple-dark) p-0 text-white sm:max-w-md ${montserrat_heading.variable} font-montserratHeading`}
                    >
                      <div className="mb-4 flex items-center justify-between border-b border-[#2D2F48] px-6 py-5">
                        <DialogTitle
                          className="bg-clip-text text-lg font-bold text-transparent"
                          style={{
                            backgroundImage:
                              'linear-gradient(45deg, red, white)',
                          }}
                        >
                          Reset Prompting Settings
                        </DialogTitle>
                        <DialogClose
                          aria-label="Close"
                          className="mt-1 text-white"
                        >
                          <XIcon className="size-4" aria-hidden="true" />
                        </DialogClose>
                      </div>
                      <div className="flex flex-col gap-6 px-6 pb-6">
                        <div className="flex items-start gap-4">
                          <IconAlertTriangle
                            size={24}
                            aria-hidden="true"
                            className="mt-0.5 text-red-500"
                          />
                          <p
                            className={`${montserrat_paragraph.variable} font-montserratParagraph text-sm leading-relaxed font-medium text-white`}
                          >
                            Are you sure you want to reset your system prompt
                            and all behavior settings to their default values?
                          </p>
                        </div>

                        <Separator className="bg-white/10" />

                        <div>
                          <p
                            className={`${montserrat_paragraph.variable} font-montserratParagraph mb-3 text-sm font-semibold text-[#D1D1D1]`}
                          >
                            This action will:
                          </p>
                          <ul className="list-none space-y-2 pl-5 text-sm text-[#D1D1D1]">
                            <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-red-400">
                              Restore the system prompt to the default template
                            </li>
                            <li className="relative before:absolute before:top-2 before:-left-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-red-400">
                              Disable Guided Learning, Document-Only mode, and
                              other custom settings
                            </li>
                          </ul>
                        </div>

                        <p
                          className={`${montserrat_paragraph.variable} font-montserratParagraph text-sm text-[#D1D1D1]`}
                        >
                          This cannot be undone. Please confirm you wish to
                          proceed.
                        </p>

                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={closeResetModal}
                            className={`rounded-md border-gray-600 text-white hover:bg-gray-800 ${montserrat_paragraph.variable} font-montserratParagraph`}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="danger"
                            className={`rounded-md bg-red-800 px-5 py-2.5 shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all duration-200 hover:bg-red-900 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3)] active:translate-y-0 ${montserrat_paragraph.variable} font-montserratParagraph`}
                            onClick={() => {
                              resetSystemPrompt()
                              closeResetModal()
                            }}
                          >
                            Confirm
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Reset and Share Link buttons */}
                  <div className="mt-4 flex flex-col items-start gap-4">
                    <Button
                      variant="danger"
                      className={`gap-2 rounded-md bg-red-800 px-5 py-2.5 transition-all duration-200 hover:bg-red-900 ${montserrat_paragraph.variable} font-montserratParagraph`}
                      onClick={openResetModal}
                    >
                      <IconAlertTriangle size={16} aria-hidden="true" />
                      Reset Prompting Settings
                    </Button>

                    <Button
                      variant="dashboard"
                      className={`gap-2 rounded-md px-5 py-2.5 transition-all duration-200 ${montserrat_paragraph.variable} font-montserratParagraph`}
                      onClick={openLinkGenerator}
                    >
                      <IconLink size={16} aria-hidden="true" />
                      Generate Share Link
                    </Button>
                  </div>
                </div>

                <LinkGeneratorModal
                  opened={linkGeneratorOpened}
                  onClose={closeLinkGenerator}
                  course_name={project_name}
                  currentSettings={{
                    guidedLearning,
                    documentsOnly,
                    systemPromptOnly,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PromptEditor
