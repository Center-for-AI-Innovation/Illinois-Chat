import { useQuery } from '@tanstack/react-query'
import type { CourseMetadata } from '~/types/courseMetadata'
import { fetchCourseMetadata } from '~/utils/apiUtils'
import { getChatbotDisplayName } from '~/utils/chatbotDisplayName'

export async function fetchChatbotDisplayName(
  courseName: string,
): Promise<string> {
  const metadata = (await fetchCourseMetadata(
    courseName,
  )) as CourseMetadata | null
  return getChatbotDisplayName(courseName, metadata)
}

/**
 * The name to show for a chatbot, for components that do not already have
 * its metadata. Falls back to the project name while loading or on error, so
 * callers can render it unconditionally.
 *
 * Uses its own query key: ['courseMetadata', name] holds differently shaped
 * data depending on who wrote it.
 */
export function useChatbotDisplayName(courseName: string | undefined) {
  const { data } = useQuery({
    queryKey: ['chatbotDisplayName', courseName],
    queryFn: () => fetchChatbotDisplayName(courseName as string),
    enabled: Boolean(courseName),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  return data ?? courseName ?? ''
}
