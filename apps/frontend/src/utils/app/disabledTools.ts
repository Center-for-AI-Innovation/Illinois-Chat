// Disabled tool ids per conversation: `{ [conversationId]: toolId[] }`.
// Storage failures read as nothing disabled.
export const DISABLED_TOOLS_KEY = 'disabledToolsByConversation'

type DisabledToolsStore = Record<string, string[]>

function readStore(): DisabledToolsStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(DISABLED_TOOLS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    // Skip malformed entries rather than dropping all.
    const store: DisabledToolsStore = {}
    for (const [conversationId, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids)) {
        store[conversationId] = ids.filter(
          (id): id is string => typeof id === 'string',
        )
      }
    }
    return store
  } catch {
    return {}
  }
}

function writeStore(store: DisabledToolsStore): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(store).length === 0) {
      localStorage.removeItem(DISABLED_TOOLS_KEY)
    } else {
      localStorage.setItem(DISABLED_TOOLS_KEY, JSON.stringify(store))
    }
  } catch {
    // Unavailable storage: choice is lost on reload.
  }
}

export function readDisabledToolIds(conversationId?: string): string[] {
  if (!conversationId) return []
  return readStore()[conversationId] ?? []
}

// Touches only this tool, so undiscovered tools keep their setting.
export function setToolDisabled(
  conversationId: string,
  toolId: string,
  disabled: boolean,
): void {
  const store = readStore()
  const ids = new Set(store[conversationId] ?? [])
  if (disabled) ids.add(toolId)
  else ids.delete(toolId)

  if (ids.size > 0) store[conversationId] = [...ids]
  else delete store[conversationId]
  writeStore(store)
}

/** For a deleted conversation. */
export function removeDisabledTools(conversationId: string): void {
  const store = readStore()
  if (!(conversationId in store)) return
  delete store[conversationId]
  writeStore(store)
}
