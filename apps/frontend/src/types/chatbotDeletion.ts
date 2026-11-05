// Shapes returned by /api/UIUC-api/chatbotDeletion.

export type ExternalStoreKind = 'database' | 'qdrant' | 's3'

export type ChatbotDeletionStatus =
  | 'pending'
  | 'running'
  | 'failed'
  | 'completed'

export interface ChatbotDeletion {
  id: number
  project_name: string
  status: ChatbotDeletionStatus
  include_external: boolean
  progress: Record<string, unknown>
  error: string | null
  created_at: string
  completed_at: string | null
}

export interface ChatbotDeletionInfo {
  external_stores: ExternalStoreKind[]
  deletion: ChatbotDeletion | null
}

export interface StartChatbotDeletionResponse {
  deletion: ChatbotDeletion
  /** False when the purge could not be queued; a super admin can retry it. */
  queued: boolean
}
