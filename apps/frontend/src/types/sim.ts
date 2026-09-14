/**
 * Types for Sim AI workflow integration.
 * API docs: https://docs.sim.ai/api-reference/getting-started
 * Auth: X-API-Key header, key prefix sk-sim-
 *
 * Discovery:  GET /api/v1/workflows?workspaceId={id}&deployedOnly=true
 * Details:    GET /api/v1/workflows/{id}
 * Execute:    POST /api/workflows/{id}/execute
 */

/** Item returned by GET /api/v1/workflows (list endpoint). */
export interface SimWorkflowListItem {
  id: string
  name: string
  description: string
  color?: string
  folderId?: string | null
  isDeployed: boolean
  deployedAt?: string
  runCount?: number
  lastRunAt?: string | null
}

/**
 * Input field definition from GET /api/v1/workflows/{id} detail endpoint.
 * Sim exposes no required flag and no default value — the detail endpoint
 * returns exactly { id, name, type, description }.
 */
export interface SimInputField {
  name: string
  type: string
  description?: string
}

/** Enriched workflow with input fields — built by combining list + detail endpoints. */
export interface SimWorkflow {
  id: string
  name: string
  description: string
  inputFields: SimInputField[]
}

/** Response body from POST /api/workflows/{id}/execute. */
export interface SimExecutionResult {
  success: boolean
  executionId?: string
  output?: unknown
  error?: string | null
  metadata?: {
    duration?: number
    startTime?: string
    endTime?: string
  }
}

/**
 * Shape of the `projects.sim_api_key` JSONB column. `{ encrypted }` is the
 * envelope written by `encryptProjectConfig` (the same one external
 * connections use). `{ plaintext }` only exists for rows migration 0016
 * converted from the old text column; the resolver re-encrypts those on
 * first read.
 */
export type SimApiKeyField = { encrypted: string } | { plaintext: string }

/**
 * Per-project Sim config as the app uses it: the request body of
 * upsertSimConfig and the decrypted, cached form on the server. The stored
 * row holds `SimApiKeyField` instead of the plain key.
 */
export interface SimProjectConfig {
  sim_api_key: string | null
  sim_base_url: string | null
  sim_workspace_id: string | null
}
