'use client'
import { useAuth } from 'react-oidc-context'
import { get_user_permission } from '@/components/UIUC-Components/runAuthCheck'
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai'
import { v4 as uuidv4 } from 'uuid'
import { useQueryClient } from '@tanstack/react-query'
import HomeContext from '@/components/home/home.context'
import { useDeleteMessages } from '@/hooks/queries/useDeleteMessages'
import { useUpdateConversation } from '@/hooks/queries/useUpdateConversation'
import { saveConversationToLocalStorage } from '@/hooks/__internal__/conversation'
import { CropwizardLicenseDisclaimer } from '~/pages/cropwizard-licenses'
import {
  toWorkspaceMessage,
  fromWorkspaceMessage,
} from '@/utils/workspaceMessages'
import { DEFAULT_TEMPERATURE } from '@/utils/app/const'
import { ReasoningCapableModels } from '@/utils/modelProviders/LLMProvider'
import { type CourseMetadata } from '@/types/courseMetadata'
import { type Conversation } from '@/types/chat'
import { type DocumentsMenuProps, type Effort } from './ComposerMenus'
import { FLAGSHIP_PROJECT, projectDisplayName } from './projectName'
import { ConversationSidebar } from './sidebar/ConversationSidebar'
import { useConversationSidebar } from './sidebar/useConversationSidebar'
import { useConversationTools, useDocumentGroups } from './useProjectResources'
import { WorkspaceShell } from './WorkspaceShell'
import { WorkspaceView } from './WorkspaceView'

const DEFAULT_EXAMPLES = [
  'Make a bullet point list of key takeaways from this project.',
  'What are the best practices for [Activity or Process] in [Context or Field]?',
  'Can you explain the concept of [Specific Concept] in simple terms?',
]

const editSyncError =
  'Your edit could not remove the older replies. Reload to see the saved conversation.'

const isReasoningModel = (modelId: string) =>
  [...ReasoningCapableModels].some((id) => id === modelId)

interface SessionProps {
  conversation: Conversation
  courseName: string
  currentEmail: string
  courseMetadata: CourseMetadata
  documentExists: boolean | null
  documents: Omit<DocumentsMenuProps, 'enabled' | 'onEnabledChange'>
  enabledDocumentGroups: string[]
  tools: ReturnType<typeof useConversationTools>
  leaveRef: RefObject<(() => void) | undefined>
  onNew: () => void
}

export function WorkspaceChat({
  courseName,
  currentEmail,
  courseMetadata,
  documentExists,
}: {
  courseName: string
  currentEmail: string
  courseMetadata: CourseMetadata
  documentExists: boolean | null
}) {
  const auth = useAuth()
  const {
    state: { selectedConversation, showChatbar },
    dispatch,
    handleNewConversation,
    handleSelectConversation,
  } = useContext(HomeContext)
  const leaveRef = useRef<() => void>(undefined)
  const documentGroups = useDocumentGroups(courseName)
  const tools = useConversationTools(courseName, selectedConversation?.id)

  const startNew = useCallback(() => {
    if (!selectedConversation?.messages.length) return
    leaveRef.current?.()
    handleNewConversation()
  }, [selectedConversation, handleNewConversation])

  const select = useCallback(
    (target: Conversation) => {
      if (target.id === selectedConversation?.id) return
      leaveRef.current?.()
      void handleSelectConversation(target)
    },
    [selectedConversation?.id, handleSelectConversation],
  )

  const sidebar = useConversationSidebar({
    email: currentEmail,
    courseName,
    onSelect: select,
    onNew: startNew,
  })

  const setSidebarOpen = useCallback(
    (open: boolean) => {
      dispatch({ field: 'showChatbar', value: open })
      localStorage.setItem('showChatbar', JSON.stringify(open))
    },
    [dispatch],
  )

  return (
    <WorkspaceShell
      sidebarOpen={showChatbar}
      onSidebarOpenChange={setSidebarOpen}
      sidebar={
        <ConversationSidebar
          model={sidebar}
          onSelect={select}
          onNew={startNew}
          project={{
            courseName,
            description: courseMetadata.project_description,
            bannerS3Path: courseMetadata.banner_image_s3,
            dashboardUrl:
              get_user_permission(courseMetadata, auth) === 'edit'
                ? `/${courseName}/dashboard`
                : undefined,
          }}
        />
      }
    >
      {selectedConversation && (
        <WorkspaceSession
          key={selectedConversation.id}
          conversation={selectedConversation}
          courseName={courseName}
          currentEmail={currentEmail}
          courseMetadata={courseMetadata}
          documentExists={documentExists}
          documents={{
            locked: Boolean(
              courseMetadata.documentsOnly ||
                selectedConversation.linkParameters?.documentsOnly,
            ),
            groups: documentGroups.groups,
            onToggleGroup: documentGroups.toggle,
          }}
          enabledDocumentGroups={documentGroups.enabledNames}
          tools={tools}
          leaveRef={leaveRef}
          onNew={startNew}
        />
      )}
    </WorkspaceShell>
  )
}

function WorkspaceSession({
  conversation,
  courseName,
  currentEmail,
  courseMetadata,
  documentExists,
  documents,
  enabledDocumentGroups,
  tools,
  leaveRef,
  onNew,
}: SessionProps) {
  const { state, dispatch } = useContext(HomeContext)
  const queryClient = useQueryClient()
  const save = useUpdateConversation(currentEmail, queryClient, courseName)
  const deleteMessages = useDeleteMessages(currentEmail, courseName)
  const models = Object.values(state.llmProviders).flatMap((provider) =>
    provider?.enabled && provider.provider !== 'WebLLM'
      ? (provider.models || [])
          .filter((m) => m.enabled)
          .map((m) => ({
            ...m,
            provider: provider.provider,
            contextWindow: m.tokenLimit,
          }))
      : [],
  )
  const [modelId, setModelId] = useState(conversation.model.id)
  const [knowledge, setKnowledge] = useState(documentExists === true)
  const [effort, setEffort] = useState<Effort>('medium')
  const [temperature, setTemperature] = useState(
    conversation.temperature ?? DEFAULT_TEMPERATURE,
  )
  const [saveError, setSaveError] = useState('')
  useEffect(() => {
    setKnowledge(documentExists === true)
  }, [documentExists])
  const activeSession = useRef(true)
  useEffect(() => {
    activeSession.current = true
    return () => {
      activeSession.current = false
    }
  }, [])
  useEffect(() => {
    if (!models.some((m) => m.id === modelId) && models[0])
      setModelId(models[0].id)
  }, [models, modelId])

  const linkParameters = conversation.linkParameters
  const useKnowledge =
    Boolean(courseMetadata.documentsOnly || linkParameters?.documentsOnly) ||
    knowledge
  const requestBody = useRef({})
  useEffect(() => {
    requestBody.current = {
      course_name: courseName,
      conversationId: conversation.id,
      linkParameters,
      modelId,
      knowledge: useKnowledge,
      effort,
      temperature,
      documentGroups: enabledDocumentGroups,
      disabledToolIds: tools.disabledToolIds,
    }
  }, [
    courseName,
    conversation.id,
    linkParameters,
    modelId,
    useKnowledge,
    effort,
    temperature,
    enabledDocumentGroups,
    tools.disabledToolIds,
  ])
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat/workspace',
        body: () => requestBody.current,
      }),
    [],
  )
  const chat = useChat({
    id: conversation.id,
    messages: conversation.messages
      .filter((m) => m.role !== 'system')
      .map(toWorkspaceMessage),
    generateId: uuidv4,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: async ({ messages, isError }) => {
      if (isError) return
      const model =
        Object.values(state.llmProviders)
          .flatMap((p) => p?.models || [])
          .find((m) => m.id === modelId) || conversation.model
      const updated = {
        ...conversation,
        model,
        temperature,
        name: conversation.messages.length
          ? conversation.name
          : messages[0]?.parts
              .filter((p) => p.type === 'text')
              .map((p) => p.text)
              .join('')
              .slice(0, 60) || 'New conversation',
        messages: messages.map(fromWorkspaceMessage),
      }
      if (activeSession.current) {
        dispatch({ field: 'selectedConversation', value: updated })
        saveConversationToLocalStorage(updated)
      }
      try {
        await save.mutateAsync({ conversation: updated, message: null })
        setSaveError('')
      } catch {
        setSaveError(
          'Your reply could not sync. Copy it before leaving this conversation.',
        )
      }
    },
  })

  const { stop } = chat
  useEffect(() => {
    leaveRef.current = () => {
      activeSession.current = false
      void stop()
    }
  }, [leaveRef, stop])

  const truncateAfter = (messageId: string, syncError: string) => {
    const index = chat.messages.findIndex((m) => m.id === messageId)
    if (index < 0) return undefined
    const kept = chat.messages.slice(0, index + 1)
    const removed = chat.messages.slice(index + 1)
    const updated = {
      ...conversation,
      messages: kept.map(fromWorkspaceMessage),
    }
    dispatch({ field: 'selectedConversation', value: updated })
    saveConversationToLocalStorage(updated)
    if (removed.length)
      deleteMessages.mutate(
        {
          convoId: conversation.id,
          deletedMessages: removed.map(fromWorkspaceMessage),
        },
        { onError: () => setSaveError(syncError) },
      )
    return kept
  }

  const flagship = courseName === FLAGSHIP_PROJECT
  return (
    <WorkspaceView
      conversationId={conversation.id}
      modelId={modelId}
      models={models}
      messages={chat.messages}
      status={chat.status}
      error={
        chat.error?.message ||
        saveError ||
        (!models.length
          ? 'No hosted models are enabled. Ask a project admin to configure a model.'
          : undefined)
      }
      welcome={{
        projectName: projectDisplayName(courseName),
        introMessage: courseMetadata.course_intro_message,
        examples: flagship
          ? []
          : courseMetadata.example_questions?.length
            ? courseMetadata.example_questions
            : DEFAULT_EXAMPLES,
        notice:
          courseName === 'cropwizard-2.0' ? (
            <CropwizardLicenseDisclaimer />
          ) : undefined,
      }}
      documents={
        documentExists === true
          ? {
              ...documents,
              enabled: useKnowledge,
              onEnabledChange: setKnowledge,
            }
          : undefined
      }
      tools={{ tools: tools.tools, onToggle: tools.toggle }}
      settings={{
        reasoning: isReasoningModel(modelId),
        effort,
        temperature,
        onEffortChange: setEffort,
        onTemperatureChange: setTemperature,
      }}
      onModelChange={setModelId}
      onNew={onNew}
      onSend={({ text, files }) => {
        dispatch({
          field: 'selectedConversation',
          value: {
            ...conversation,
            name: conversation.messages.length
              ? conversation.name
              : text.slice(0, 60) || 'Attachments',
            messages: [
              ...chat.messages.map(fromWorkspaceMessage),
              { id: uuidv4(), role: 'user', content: text },
            ],
          },
        })
        chat.clearError()
        void chat.sendMessage({ text, ...(files.length ? { files } : {}) })
      }}
      onStop={() => {
        void chat.stop()
      }}
      onRetry={() => {
        chat.clearError()
        void chat.regenerate()
      }}
      onApproval={(id, approved) => {
        void chat.addToolApprovalResponse({ id, approved })
      }}
      onRestore={(messageId) => {
        const kept = truncateAfter(
          messageId,
          'Restoring the checkpoint could not sync. Reload to see the saved conversation.',
        )
        if (kept) chat.setMessages(kept)
      }}
      onFeedback={(messageId, feedback) => {
        const messages = chat.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                metadata: {
                  ...(m.metadata && typeof m.metadata === 'object'
                    ? m.metadata
                    : {}),
                  feedback: feedback ?? undefined,
                },
              }
            : m,
        )
        chat.setMessages(messages)
        const updated = {
          ...conversation,
          messages: messages.map(fromWorkspaceMessage),
        }
        dispatch({ field: 'selectedConversation', value: updated })
        saveConversationToLocalStorage(updated)
        save.mutate(
          { conversation: updated, message: null },
          {
            onError: () =>
              setSaveError('Your feedback could not be saved. Please retry.'),
          },
        )
      }}
      onEdit={(messageId, text) => {
        const original = chat.messages.find((m) => m.id === messageId)
        if (!original || !truncateAfter(messageId, editSyncError)) return
        const files = original.parts.filter((part) => part.type === 'file')
        chat.clearError()
        void chat.sendMessage({
          text,
          messageId,
          ...(files.length ? { files } : {}),
        })
      }}
    />
  )
}
