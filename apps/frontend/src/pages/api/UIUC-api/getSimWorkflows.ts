import { type NextApiResponse } from 'next'
import {
  discoverWithCredentials,
  resolveSimCredentials,
  simConfigErrorResponse,
} from '~/utils/simConfig'
import { simUpstreamErrorResponse } from '~/utils/simDiscovery'
import { withCourseAccessFromRequest } from '~/server/authorization'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'

/**
 * GET /api/UIUC-api/getSimWorkflows?course_name=X
 *
 * Discovers deployed workflows from SimAI. Credentials come from the project's
 * stored configuration and never from the caller — see `resolveSimCredentials`.
 *
 * Access follows the chat page: anyone may list a public project's tools,
 * including visitors who are not logged in, while a private project requires
 * membership. The chat page asks on every load, so a stricter check here
 * shows an error toast on public chatbots that have no tools at all.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // The project the access check authorized, never a separate copy (#312).
  const course_name = req.courseName!

  const resolved = await resolveSimCredentials(course_name)

  if (!resolved.ok) {
    // A project that has never been configured legitimately has no workflows.
    // Anything else is a real failure and must not be reported as "no tools".
    if (resolved.reason === 'not_configured') {
      return res.status(200).json({ workflows: [], failed: [] })
    }
    const { status, error } = simConfigErrorResponse(resolved.reason)
    return res.status(status).json({ error })
  }

  const result = await discoverWithCredentials(resolved.creds)

  if (!result.ok) {
    switch (result.reason) {
      case 'missing_workspace_id': {
        const { status, error } = simConfigErrorResponse('missing_workspace_id')
        return res.status(status).json({ error })
      }
      case 'invalid_base_url':
        return res.status(400).json({ error: 'Invalid Sim base URL' })
      case 'list_failed': {
        console.error('[getSimWorkflows] list failed', {
          status: result.status,
        })
        const mapped = simUpstreamErrorResponse(result.status)
        return res.status(mapped.status).json({ error: mapped.error })
      }
      default: {
        const error =
          result.reason === 'request_failed' ? result.error : result.reason
        console.error('[getSimWorkflows] error', {
          error: error instanceof Error ? error.message : String(error),
        })
        return res.status(500).json({ error: 'Failed to fetch Sim workflows' })
      }
    }
  }

  const { workflows, failed } = result

  if (failed.length > 0) {
    console.error('[getSimWorkflows] could not describe workflows', failed)
  }

  // Every workflow failed to describe: report it rather than returning an
  // empty list, which the caller cannot distinguish from an empty workspace.
  if (workflows.length === 0 && failed.length > 0) {
    return res.status(502).json({
      error: `Could not read input fields for any Sim workflow (${failed.length} failed)`,
      failed,
    })
  }

  console.debug('[getSimWorkflows]', workflows.length, 'workflows discovered')
  return res.status(200).json({ workflows, failed })
}

export default withCourseAccessFromRequest('any')(handler)
