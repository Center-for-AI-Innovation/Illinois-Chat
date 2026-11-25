import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type CourseMetadata } from '~/types/courseMetadata'
import { callSetCourseMetadata } from '~/utils/apiUtils'
import { courseMetadataQueryKey } from './useFetchCourseMetadata'

type CourseMetadataChanges = Partial<CourseMetadata>

/** The server answered but did not save the changes. */
export class CourseMetadataSaveError extends Error {
  constructor() {
    super('Failed to save project settings')
    this.name = 'CourseMetadataSaveError'
  }
}

/**
 * Saves some of a project's metadata fields. Send only the fields being
 * changed: the server merges them over what it has stored.
 *
 * The change shows in the shared cache right away. If the save fails, only
 * the fields this save touched are put back, so other saves made in the
 * meantime are kept. Either way the entry is refetched afterwards so every
 * reader ends up on the server's copy.
 */
export function useUpdateCourseMetadata(courseName: string) {
  const queryClient = useQueryClient()
  const key = courseMetadataQueryKey(courseName)

  const mutation = useMutation({
    mutationFn: async (changes: CourseMetadataChanges) => {
      const ok = await callSetCourseMetadata(courseName, changes)
      if (!ok) throw new CourseMetadataSaveError()
      return changes
    },
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CourseMetadata>(key)
      if (previous) {
        queryClient.setQueryData<CourseMetadata>(key, {
          ...previous,
          ...changes,
        })
      }
      // Remember the old values of just the fields being changed.
      const previousFields = previous
        ? (Object.fromEntries(
            Object.keys(changes).map((field) => [
              field,
              previous[field as keyof CourseMetadata],
            ]),
          ) as CourseMetadataChanges)
        : undefined
      return { previousFields }
    },
    onError: (_error, _changes, context) => {
      const previousFields = context?.previousFields
      if (!previousFields) return
      queryClient.setQueryData<CourseMetadata>(key, (current) =>
        current ? { ...current, ...previousFields } : current,
      )
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })

  /** Saves the changes; resolves to false instead of throwing on failure. */
  const { mutateAsync } = mutation
  const save = useCallback(
    async (changes: CourseMetadataChanges): Promise<boolean> => {
      try {
        await mutateAsync(changes)
        return true
      } catch {
        return false
      }
    },
    [mutateAsync],
  )

  return { ...mutation, save }
}
