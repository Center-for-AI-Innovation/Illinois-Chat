import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { getBackendUrl } from '~/utils/apiUtils'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.downloadMITCourse')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url, course_name, local_dir } = req.query

  if (!url || !course_name || !local_dir) {
    return res.status(400).json({
      error: 'url, course_name, and local_dir parameters are required',
    })
  }

  // Ensure parameters are strings
  const urlParam = Array.isArray(url) ? url[0] : url
  const courseName = Array.isArray(course_name) ? course_name[0] : course_name
  const localDir = Array.isArray(local_dir) ? local_dir[0] : local_dir

  if (!urlParam || !courseName || !localDir) {
    return res.status(400).json({
      error: 'url, course_name, and local_dir parameters are required',
    })
  }

  try {
    const response = await fetch(
      `${getBackendUrl()}/mit-download?url=${encodeURIComponent(urlParam)}&course_name=${encodeURIComponent(courseName)}&local_dir=${encodeURIComponent(localDir)}`,
    )

    if (!response.ok) {
      log.error('backend failed to download the MIT course', {
        status: response.status,
        url: urlParam,
      })
      return res.status(response.status).json({
        error: `Failed to download MIT course. Status: ${response.status}`,
      })
    }

    const data = await response.json()
    return res.status(200).json(data)
  } catch (error) {
    log.error('error downloading MIT course', { url: urlParam }, error)
    return res.status(500).json({
      error: 'Internal server error while downloading MIT course',
    })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
