import {
  type InfiniteData,
  type QueryClient,
  useMutation,
} from '@tanstack/react-query'
import type { Message, Conversation, ConversationPage } from '~/types/chat'
import { type FolderWithConversation } from '~/types/folder'
import { saveConversationToServer } from '@/hooks/__internal__/conversation'

export function useUpdateConversation(
  user_email: string,
  queryClient: QueryClient,
  course_name: string,
) {
  // console.log('useUpdateConversation with user_email: ', user_email)
  return useMutation({
    mutationKey: ['updateConversation', user_email, course_name],
    mutationFn: async (vars: {
      conversation: Conversation
      message: Message | null
    }) =>
      saveConversationToServer(vars.conversation, course_name, vars.message),
    onMutate: async ({ conversation: updatedConversation }) => {
      const conversationHistoryKey = ['conversationHistory', course_name, '']
      const foldersKey = ['folders', course_name]

      const previousConversationHistory = queryClient.getQueryData<
        InfiniteData<ConversationPage>
      >(conversationHistoryKey)
      // The folders query key also carries the search term, so match by
      // prefix; an exact ['folders', course_name] key never exists.
      const previousFolders = queryClient.getQueriesData<
        FolderWithConversation[]
      >({ queryKey: foldersKey })

      await queryClient.cancelQueries({ queryKey: conversationHistoryKey })
      if (updatedConversation.folderId) {
        await queryClient.cancelQueries({ queryKey: foldersKey })
      }

      queryClient.setQueryData(
        conversationHistoryKey,
        (oldData: InfiniteData<ConversationPage> | undefined) => {
          if (!oldData) return oldData
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              conversations: page.conversations.map((c) =>
                c.id === updatedConversation.id ? updatedConversation : c,
              ),
            })),
          }
        },
      )

      if (updatedConversation.folderId) {
        queryClient.setQueriesData(
          { queryKey: foldersKey },
          (oldData: FolderWithConversation[] | undefined) => {
            if (!Array.isArray(oldData)) return oldData
            return oldData.map((f) => {
              if (f.id !== updatedConversation.folderId) return f
              return {
                ...f,
                conversations: (f.conversations || []).map((c) =>
                  c.id === updatedConversation.id ? updatedConversation : c,
                ),
              }
            })
          },
        )
      }

      // Whether this conversation is, or was, inside a cached folder. Only then
      // do the folders need a refetch once the save settles.
      const touchesFolders =
        !!updatedConversation.folderId ||
        previousFolders.some(([, folders]) =>
          folders?.some((f) =>
            f.conversations?.some((c) => c.id === updatedConversation.id),
          ),
        )

      return { previousConversationHistory, previousFolders, touchesFolders }
    },
    onError: (error, _variables, context) => {
      // An error happened!
      // Rollback the optimistic update
      queryClient.setQueryData(
        ['conversationHistory', course_name, ''],
        context?.previousConversationHistory,
      )
      context?.previousFolders?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      console.error(
        'Error saving updated conversation to server:',
        error,
        context,
      )
    },
    onSuccess: (_data, _variables, _context) => {
      // The mutation was successful!
      // Do something with the updated conversation
      // updateConversation(data)
      // No need to do anything here because the conversationHistory query will be invalidated
    },
    onSettled: (_data, _error, _variables, context) => {
      queryClient.invalidateQueries({
        queryKey: ['conversationHistory', course_name, ''],
      })

      // Skipped for conversations outside folders so a model reply does not
      // refetch every folder.
      if (context?.touchesFolders) {
        queryClient.invalidateQueries({
          queryKey: ['folders', course_name],
        })
      }
    },
  })
}
