import { useMutation } from '@tanstack/react-query'
import type { ConnectionKind } from '~/utils/projectConnections/validation'

export interface TestConnectionResult {
  ok: boolean
  code?: string
  message?: string
  details?: Record<string, unknown>
}

export interface TestProjectConnectionVariables {
  projectName: string
  kind: ConnectionKind
}

/**
 * Probes the connection **as stored**, not as currently typed into the form.
 *
 * The supplied-config mode of the endpoint needs a complete config, and the
 * UI only ever holds secrets masked to their last 4 characters — sending those
 * back would probe with a bogus credential. So the UI labels this "Test saved
 * connection" and callers should save before testing.
 */
export async function testProjectConnection({
  projectName,
  kind,
}: TestProjectConnectionVariables): Promise<TestConnectionResult> {
  const response = await fetch('/api/UIUC-api/projectConnections/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, project_name: projectName }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.error ?? `Test failed (${response.status})`)
  }

  // A failed probe is a 200 with `ok: false` — the request itself succeeded.
  // Returning it rather than throwing keeps the failure code and message
  // available to the UI instead of collapsing them into an error string.
  return body as TestConnectionResult
}

export function useTestProjectConnection() {
  return useMutation({ mutationFn: testProjectConnection })
}
