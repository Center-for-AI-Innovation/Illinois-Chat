import { type QueryClient, useMutation } from '@tanstack/react-query'
import { type FolderWithConversation } from '~/types/folder'
import { deleteFolderFromServer } from '@/hooks/__internal__/folders'

export function useDeleteFolder(
  user_email: string,
  queryClient: QueryClient,
  course_name: string,
) {
  return useMutation({
    mutationKey: ['deleteFolder', user_email, course_name],
    mutationFn: async (deletedFolder: FolderWithConversation) =>
      deleteFolderFromServer(deletedFolder, course_name, user_email),
    onMutate: async (deletedFolder: FolderWithConversation) => {
      await queryClient.cancelQueries({ queryKey: ['folders', course_name] })

      // The folders query key also carries the search term, so match by
      // prefix; an exact ['folders', course_name] key never exists.
      const oldFolder = queryClient.getQueriesData<FolderWithConversation[]>({
        queryKey: ['folders', course_name],
      })

      queryClient.setQueriesData(
        { queryKey: ['folders', course_name] },
        (oldData: FolderWithConversation[] | undefined) => {
          const safeOld = Array.isArray(oldData) ? oldData : []
          return safeOld.filter(
            (f: FolderWithConversation) => f.id !== deletedFolder.id,
          )
        },
      )

      return { oldFolder, deletedFolder }
    },
    onError: (error, _variables, context) => {
      context?.oldFolder?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      console.error('Error deleting folder from server:', error, context)
    },
    onSuccess: (_data, _variables, _context) => {
      // No need to do anything here because the folders query will be invalidated
    },
    onSettled: (_data, _error, _variables, _context) => {
      queryClient.invalidateQueries({ queryKey: ['folders', course_name] })
      queryClient.invalidateQueries({
        queryKey: ['conversationHistory', course_name],
      })
    },
  })
}
