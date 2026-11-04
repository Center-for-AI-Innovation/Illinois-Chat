'use client'
import { useCallback, useContext, useEffect, useMemo } from 'react'
import HomeContext from '@/components/home/home.context'
import { useFetchEnabledDocGroups } from '@/hooks/queries/useFetchEnabledDocGroups'
import { readDisabledToolIds, setToolDisabled } from '@/utils/app/disabledTools'
import { useFetchAllWorkflows } from '@/utils/functionCalling/handleFunctionCalling'
import { showToast } from '@/utils/toastUtils'

export const ALL_DOCUMENTS_GROUP = {
  id: 'DocGroup-all',
  name: 'All Documents',
  checked: true,
}

export function useDocumentGroups(courseName: string) {
  const {
    state: { documentGroups },
    dispatch,
  } = useContext(HomeContext)
  const { data, isSuccess } = useFetchEnabledDocGroups(courseName)

  useEffect(() => {
    if (!isSuccess) return
    dispatch({
      field: 'documentGroups',
      value: [
        ALL_DOCUMENTS_GROUP,
        ...(data ?? []).map((group, index) => ({
          id: group.id != null ? String(group.id) : `DocGroup-${index}`,
          name: group.name,
          checked: false,
          adminDisabled: group.enabled === false,
        })),
      ],
    })
  }, [data, isSuccess, dispatch])

  const toggle = useCallback(
    (id: string) => {
      if (documentGroups.find((g) => g.id === id)?.adminDisabled) return
      dispatch({
        field: 'documentGroups',
        value: documentGroups.map((g) =>
          g.id === id ? { ...g, checked: !g.checked } : g,
        ),
      })
    },
    [documentGroups, dispatch],
  )

  const enabledNames = useMemo(
    () =>
      documentGroups
        .filter((g) => g.checked && !g.adminDisabled)
        .map((g) => g.name),
    [documentGroups],
  )

  return { groups: documentGroups, enabledNames, toggle }
}

export function useConversationTools(
  courseName: string,
  conversationId: string | undefined,
) {
  const {
    state: { tools },
    dispatch,
  } = useContext(HomeContext)
  const { data, isSuccess, isError, error } = useFetchAllWorkflows(courseName)

  useEffect(() => {
    if (!isSuccess) return
    const disabled = new Set(readDisabledToolIds(conversationId))
    dispatch({
      field: 'tools',
      value: (data ?? []).map((t) => ({ ...t, enabled: !disabled.has(t.id) })),
    })
  }, [data, isSuccess, conversationId, dispatch])

  useEffect(() => {
    if (!isError) return
    showToast({
      type: 'error',
      title: 'Error loading tools',
      message: `${(error as Error).message}. Regular chat features still work.`,
    })
  }, [isError, error])

  const toggle = useCallback(
    (id: string, enabled: boolean) => {
      if (conversationId) setToolDisabled(conversationId, id, !enabled)
      dispatch({
        field: 'tools',
        value: tools.map((t) => (t.id === id ? { ...t, enabled } : t)),
      })
    },
    [conversationId, tools, dispatch],
  )

  const disabledToolIds = useMemo(
    () => tools.filter((t) => t.enabled === false).map((t) => t.id),
    [tools],
  )

  return { tools, disabledToolIds, toggle }
}
