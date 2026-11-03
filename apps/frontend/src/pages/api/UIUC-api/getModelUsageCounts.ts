import { withAuth } from '~/utils/authMiddleware'
import { getBackendUrl } from '~/utils/apiUtils'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.getModelUsageCounts')

interface ModelUsage {
  model_name: string
  count: number
  percentage: number
}

export default withCourseOwnerOrAdminAccess()(handler)

async function handler(req: any, res: any) {
  const { project_name } = req.body

  if (!project_name) {
    return res
      .status(400)
      .json({ error: 'Missing required project_name parameter' })
  }

  try {
    const response = await fetch(
      `${getBackendUrl()}/getModelUsageCounts?project_name=${project_name}`,
    )

    if (!response.ok) {
      const errorText = await response.text()
      log.error('backend getModelUsageCounts failed', {
        status: response.status,
        body: errorText.slice(0, 500),
      })
      return res.status(response.status).json({
        error: `Failed to fetch data: ${response.status} - ${errorText}`,
      })
    }

    const data = (await response.json()) as ModelUsage[]
    return res.status(200).json(data)
  } catch (error) {
    log.error('failed to fetch model usage counts', undefined, error)
    return res.status(500).json({
      error: 'Failed to fetch model usage counts',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}

// Helper function remains the same
export async function getModelUsageCounts(project_name: string) {
  try {
    log.debug('fetching model usage counts', { course: project_name })
    const response = await fetch(
      `/api/UIUC-api/getModelUsageCounts?project_name=${project_name}`,
    )

    if (!response.ok) {
      log.error('getModelUsageCounts request failed', {
        course: project_name,
        status: response.status,
        body: (await response.text()).slice(0, 500),
      })
      return {
        status: response.status,
        data: [] as ModelUsage[],
        error: `HTTP error! status: ${response.status}`,
      }
    }

    const data = await response.json()
    log.debug('fetched model usage data', {
      course: project_name,
      rows: Array.isArray(data) ? data.length : undefined,
    })
    return {
      status: 200,
      data: data as ModelUsage[],
    }
  } catch (error) {
    log.error(
      'error fetching model usage counts',
      { course: project_name },
      error,
    )
    return {
      status: 500,
      data: [] as ModelUsage[],
      error:
        error instanceof Error
          ? error.message
          : 'Failed to load model usage data',
    }
  }
}
