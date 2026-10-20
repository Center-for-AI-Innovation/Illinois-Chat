import { useMutation, useQuery } from '@tanstack/react-query'
import type {
  ChatbotDeletionInfo,
  StartChatbotDeletionResponse,
} from '~/types/chatbotDeletion'

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string
    message?: string
  } | null
  return body?.message ?? body?.error ?? fallback
}

export async function fetchChatbotDeletionInfo(
  courseName: string,
): Promise<ChatbotDeletionInfo> {
  const response = await fetch(
    `/api/UIUC-api/chatbotDeletion?course_name=${encodeURIComponent(courseName)}`,
  )
  if (!response.ok) {
    throw new Error(await errorMessage(response, `Error ${response.status}`))
  }
  return response.json()
}

export function useFetchChatbotDeletionInfo({
  courseName,
  enabled = true,
}: {
  courseName: string
  enabled?: boolean
}) {
  return useQuery({
    queryKey: ['chatbotDeletion', courseName],
    queryFn: () => fetchChatbotDeletionInfo(courseName),
    enabled: enabled && Boolean(courseName),
    retry: 1,
  })
}

export interface DeleteChatbotVariables {
  courseName: string
  confirmName: string
  includeExternal: boolean
}

export async function deleteChatbot({
  courseName,
  confirmName,
  includeExternal,
}: DeleteChatbotVariables): Promise<StartChatbotDeletionResponse> {
  const response = await fetch('/api/UIUC-api/chatbotDeletion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course_name: courseName,
      confirm_name: confirmName,
      include_external: includeExternal,
    }),
  })
  if (!response.ok) {
    throw new Error(
      await errorMessage(response, 'Failed to delete the chatbot'),
    )
  }
  return response.json()
}

export function useDeleteChatbot() {
  return useMutation({
    mutationKey: ['deleteChatbot'],
    mutationFn: deleteChatbot,
  })
}
