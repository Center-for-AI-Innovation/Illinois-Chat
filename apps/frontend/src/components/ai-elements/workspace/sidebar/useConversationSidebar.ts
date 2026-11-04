'use client'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import posthog from 'posthog-js'
import HomeContext from '@/components/home/home.context'
import {
  saveConversationToLocalStorage,
  saveConversationToServer,
} from '@/hooks/__internal__/conversation'
import { useDeleteAllConversations } from '@/hooks/queries/useDeleteAllConversations'
import { useDeleteConversation } from '@/hooks/queries/useDeleteConversation'
import { useFetchConversationHistory } from '@/hooks/queries/useFetchConversationHistory'
import { useFetchFolders } from '@/hooks/queries/useFetchFolders'
import { useUpdateConversation } from '@/hooks/queries/useUpdateConversation'
import { useDebounce } from '@/hooks/useDebounce'
import { type Conversation } from '@/types/chat'
import { removeDisabledTools } from '@/utils/app/disabledTools'
import { downloadConversationHistoryUser } from '@/utils/downloadConversationHistoryUser'
import { showToast } from '@/utils/toastUtils'

async function migrateLocalConversations(
  conversations: Conversation[],
  email: string,
  courseName: string,
) {
  await Promise.all(
    conversations.map(async (conversation) => {
      const owned = {
        ...conversation,
        userEmail: email,
        projectName: courseName,
      }
      try {
        await saveConversationToServer(
          owned,
          courseName,
          owned.messages?.at(-1) ?? null,
        )
      } catch (error) {
        const details = (error as { details?: string } | null)?.details
        if (!details?.includes('already exists')) throw error
      }
    }),
  ).catch((error) => console.error('Error migrating conversations:', error))
}

export function useConversationSidebar({
  email,
  courseName,
  onSelect,
  onNew,
}: {
  email: string
  courseName: string
  onSelect: (conversation: Conversation) => void
  onNew: () => void
}) {
  const {
    state: { conversations, folders, selectedConversation },
    dispatch,
    handleCreateFolder,
    handleDeleteFolder,
    handleUpdateFolder,
  } = useContext(HomeContext)
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 500)
  const [isExporting, setIsExporting] = useState(false)

  const foldersQuery = useFetchFolders(email, debouncedSearch, courseName)
  const history = useFetchConversationHistory(
    email,
    debouncedSearch,
    courseName,
  )
  const deleteMutation = useDeleteConversation(
    email,
    queryClient,
    courseName,
    debouncedSearch,
  )
  const deleteAllMutation = useDeleteAllConversations(
    queryClient,
    email,
    courseName,
  )
  const updateMutation = useUpdateConversation(email, queryClient, courseName)

  useEffect(() => {
    if (foldersQuery.isFetched && !foldersQuery.isLoading) {
      dispatch({ field: 'folders', value: foldersQuery.data ?? [] })
    } else if (foldersQuery.data === undefined) {
      dispatch({ field: 'folders', value: [] })
    }
  }, [
    foldersQuery.data,
    foldersQuery.isFetched,
    foldersQuery.isLoading,
    dispatch,
  ])

  const { data: historyData, isFetched, isLoading, refetch } = history
  useEffect(() => {
    if (!isFetched || isLoading || !historyData) return
    const loaded = historyData.pages
      .flatMap((page) => page?.conversations ?? [])
      .filter(Boolean)
    dispatch({ field: 'conversations', value: loaded })

    if (localStorage.getItem('convoMigrationComplete') === 'true') return
    localStorage.setItem('convoMigrationComplete', 'false')
    const legacy = localStorage.getItem('conversationHistory')
    if (loaded.length || !legacy || legacy === '[]') return
    try {
      const legacyConversations: Conversation[] = JSON.parse(legacy)
      posthog.capture('migration_started', { distinctId: email })
      dispatch({ field: 'conversations', value: legacyConversations })
      void migrateLocalConversations(legacyConversations, email, courseName)
      localStorage.setItem('convoMigrationComplete', 'true')
      setTimeout(() => refetch(), 100)
    } catch (error) {
      posthog.capture('migration_error', {
        distinctId: email,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [historyData, isFetched, isLoading, dispatch, email, courseName, refetch])

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const findConversation = useCallback(
    (id: string) =>
      (selectedConversation?.id === id ? selectedConversation : undefined) ??
      conversations.find((c) => c.id === id) ??
      folders.flatMap((f) => f.conversations ?? []).find((c) => c.id === id),
    [selectedConversation, conversations, folders],
  )

  const persist = useCallback(
    (updated: Conversation) => {
      if (selectedConversation?.id === updated.id) {
        dispatch({ field: 'selectedConversation', value: updated })
        saveConversationToLocalStorage(updated, { allowEmptyMessages: true })
      }
      dispatch({
        field: 'conversations',
        value: conversations.map((c) => (c.id === updated.id ? updated : c)),
      })
      if (updated.messages.length)
        updateMutation.mutate({ conversation: updated, message: null })
    },
    [selectedConversation, conversations, dispatch, updateMutation],
  )

  const rename = useCallback(
    (id: string, name: string) => {
      const conversation = findConversation(id)
      if (conversation && name.trim())
        persist({ ...conversation, name: name.trim() })
    },
    [findConversation, persist],
  )

  const moveToFolder = useCallback(
    (id: string, folderId: string | null) => {
      const conversation = findConversation(id)
      if (conversation && conversation.folderId !== folderId)
        persist({ ...conversation, folderId })
    },
    [findConversation, persist],
  )

  const remove = useCallback(
    (conversation: Conversation) => {
      const remaining = conversations.filter((c) => c.id !== conversation.id)
      dispatch({ field: 'conversations', value: remaining })
      setSearchTerm('')
      deleteMutation.mutate(conversation, {
        onSuccess: () => removeDisabledTools(conversation.id),
      })
      if (selectedConversation?.id !== conversation.id) return
      if (remaining[0]) {
        onSelect(remaining[0])
      } else {
        localStorage.removeItem('selectedConversation')
        onNew()
      }
    },
    [
      conversations,
      dispatch,
      deleteMutation,
      selectedConversation,
      onSelect,
      onNew,
    ],
  )

  const clearAll = useCallback(() => {
    dispatch({ field: 'conversations', value: [] })
    setSearchTerm('')
    onNew()
    deleteAllMutation.mutate()
  }, [dispatch, onNew, deleteAllMutation])

  const exportHistory = useCallback(async () => {
    setIsExporting(true)
    try {
      const { message } = await downloadConversationHistoryUser(
        email,
        courseName,
      )
      showToast({
        message,
        type: message.startsWith('Error') ? 'error' : 'info',
      })
    } finally {
      setIsExporting(false)
    }
  }, [email, courseName])

  const chatFolders = useMemo(
    () =>
      folders
        .filter((f) => f.type === 'chat')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  )

  return {
    searchTerm,
    setSearchTerm,
    searching: debouncedSearch.length > 0,
    conversations: conversations.filter((c) => !c.folderId),
    folders: chatFolders,
    selectedId: selectedConversation?.id,
    loading: history.isLoading,
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    loadMore,
    rename,
    moveToFolder,
    remove,
    clearAll,
    exportHistory,
    isExporting,
    createFolder: () => handleCreateFolder('New folder', 'chat'),
    renameFolder: handleUpdateFolder,
    deleteFolder: handleDeleteFolder,
    totalConversations: conversations.length,
  }
}
