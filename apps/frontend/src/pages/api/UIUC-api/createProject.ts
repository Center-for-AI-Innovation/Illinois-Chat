import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { getBackendUrl } from '~/utils/apiUtils'
import { getProjectNameError, isValidProjectName } from '~/utils/projectName'
import { checkCourseExists } from './getCourseExists'
import { getCourseMetadata } from './getCourseMetadata'
import { writeCourseMetadata } from '~/utils/courseMetadataStore'
import type { CourseMetadata } from '~/types/courseMetadata'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.createProject')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { project_name, project_description, project_owner_email, is_private } =
    req.body

  if (!project_name || !project_owner_email) {
    return res.status(400).json({
      error: 'project_name and project_owner_email are required',
    })
  }

  if (!isValidProjectName(project_name)) {
    return res.status(400).json({
      error: 'Invalid project name',
      message:
        getProjectNameError(project_name) ??
        'Project names can only use letters, numbers, dashes, underscores, and dots (a dot cannot be the first character).',
    })
  }

  // Server-side validation: Check if project name already exists
  // This prevents race conditions where a user could bypass client-side validation
  try {
    const projectExists = await checkCourseExists(project_name)

    if (projectExists) {
      return res.status(409).json({
        error: 'Project name already exists',
        message: `A project with the name "${project_name}" already exists. Please choose a different name.`,
      })
    }
  } catch (error) {
    log.error(
      'could not check whether the project name is free',
      { course: project_name },
      error,
    )
    // If Redis check fails, we must fail the request to prevent data inconsistency
    // Allowing project creation when Redis is down would lead to out-of-sync data
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'Unable to validate project name. Please contact support.',
    })
  }

  const requestBody = {
    project_name: project_name,
    project_description: project_description,
    project_owner_email: project_owner_email,
    is_private: is_private,
  }

  try {
    const response = await fetch(`${getBackendUrl()}/createProject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      log.error('backend failed to create the project', {
        course: project_name,
        status: response.status,
      })
      // Forward the backend's JSON error body when it has one; Flask abort()
      // responses are HTML, so parse defensively and keep the status either way.
      const backendBody = (await response.json().catch(() => null)) as {
        error?: string
        message?: string
      } | null
      return res.status(response.status).json({
        error:
          backendBody?.error ??
          `Failed to create the project. Status: ${response.status}`,
        ...(backendBody?.message ? { message: backendBody.message } : {}),
      })
    }

    // Backend has written the seed metadata to Redis. Mirror it to Postgres
    // so server-side search sees the new project. Drift here is tolerable —
    // the backfill script reconciles — so we log and continue rather than
    // 5xx; the project already exists in Redis and the user can use it.
    try {
      const seeded = (await getCourseMetadata(project_name)) as CourseMetadata
      if (seeded) {
        await writeCourseMetadata(project_name, seeded)
      } else {
        log.warn(
          'Redis metadata missing after backend create; Postgres not mirrored',
          { course: project_name },
        )
      }
    } catch (pgErr) {
      log.error(
        'failed to mirror the project to Postgres; search index may lag until backfill runs',
        { course: project_name },
        pgErr,
      )
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    log.error('error creating project', { course: project_name }, error)
    return res.status(500).json({
      error: 'Internal server error while creating project',
    })
  }
}

export default withAuth(handler)
