import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { backendFetch } from '~/utils/server/backendFetch'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.ingest')

type IngestResponse = {
  task_id?: string
  error?: string
}

const handler = async (
  req: AuthenticatedRequest,
  res: NextApiResponse<IngestResponse>,
) => {
  try {
    if (req.method !== 'POST') {
      log.warn('request method not allowed', { method: req.method })
      return res.status(405).json({
        error: '❌❌ Request method not allowed',
      })
    }

    const { uniqueFileName, courseName, readableFilename, forceEmbeddings } =
      req.body

    log.debug('submitting to ingest queue', {
      file: uniqueFileName,
      readable: readableFilename,
      force_embeddings: forceEmbeddings,
    })

    if (!uniqueFileName || !courseName || !readableFilename) {
      log.warn('missing body parameters', {
        has_file: Boolean(uniqueFileName),
        has_course: Boolean(courseName),
        has_readable: Boolean(readableFilename),
      })
      return res.status(400).json({
        error: '❌❌ Missing body parameters',
      })
    }

    const s3_filepath = `courses/${courseName}/${uniqueFileName}`

    const response = await backendFetch(`${process.env.INGEST_URL}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        course_name: courseName,
        readable_filename: readableFilename,
        s3_paths: s3_filepath,
        force_embeddings: forceEmbeddings,
      }),
    })

    if (!response.ok) {
      // backendFetch already logged one ERROR with the status and body.
      log.warn('ingest not queued', {
        status: response.status,
        file: s3_filepath,
      })
      return res.status(response.status).json({
        error: `Ingest backend answered with status ${response.status}`,
      })
    }

    const responseBody = await response.json()
    log.info('submitted to ingest queue', {
      file: s3_filepath,
      status: response.status,
      task_id: responseBody?.task_id,
    })

    return res.status(200).json(responseBody)
  } catch (error) {
    log.error(
      'ingest submission failed',
      { file: req.body?.uniqueFileName },
      error,
    )
    const err = `❌❌ -- Bottom of /ingest -- Internal Server Error during ingest submission to Beam: ${error}`
    return res.status(500).json({ error: err })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
