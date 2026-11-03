import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { getBackendUrl } from '~/utils/apiUtils'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { backendFetch } from '~/utils/server/backendFetch'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.ingestCanvas')

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  try {
    if (req.method !== 'POST') {
      log.warn('request method not allowed', { method: req.method })
      return res.status(405).json({ error: '❌❌ Request method not allowed' })
    }

    const { courseName, canvas_url, selectedCanvasOptions } = req.body

    log.debug('submitting to Canvas ingest queue', {
      canvas_url,
      options: selectedCanvasOptions,
    })

    if (!courseName || !canvas_url) {
      log.warn('missing body parameters', {
        has_course: Boolean(courseName),
        has_canvas_url: Boolean(canvas_url),
      })
      return res.status(400).json({ error: '❌❌ Missing body parameters' })
    }

    log.debug('sending Canvas approval email')

    // Send email to kastan alerting that he needs to approve a canvas course
    const sendEmailResponse = await backendFetch(
      `${getBackendUrl()}/send-transactional-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_recipients_list: ['rohan13@illinois.edu'],
          bcc_recipients_list: [],
          sender: 'rohan13@illinois.edu',
          subject: 'New Canvas Course Ingestion Request',
          body_text: `New Canvas course ingestion request received:
Course Name: ${courseName}
Canvas URL: ${canvas_url}
Selected Options: ${selectedCanvasOptions.join(', ')}
Please review and approve at https://canvas.illinois.edu/ using account uiuc.chat@ad.uillinois.edu.`,
        }),
      },
    )
    // const emailResponseBody = await sendEmailResponse.json()
    // A failed email does not stop the ingest; backendFetch already logged
    // the status and body.
    if (!sendEmailResponse.ok) {
      log.warn('Canvas approval email not sent, continuing with the ingest', {
        status: sendEmailResponse.status,
      })
    }
    // console.debug("Sent email to Kastan to alert him of new Canvas ingest")

    const response = await backendFetch(
      `${process.env.INGEST_URL}`.replace('/ingest', '/canvas_ingest'),
      {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          canvas_url: canvas_url,
          course_name: courseName,
          files: selectedCanvasOptions.includes('files') ? 'true' : 'false',
          pages: selectedCanvasOptions.includes('pages') ? 'true' : 'false',
          modules: selectedCanvasOptions.includes('modules') ? 'true' : 'false',
          syllabus: selectedCanvasOptions.includes('syllabus')
            ? 'true'
            : 'false',
          assignments: selectedCanvasOptions.includes('assignments')
            ? 'true'
            : 'false',
          discussions: selectedCanvasOptions.includes('discussions')
            ? 'true'
            : 'false',
        }),
      },
    )

    const responseBody = await response.json()
    // A failure status was already logged by backendFetch with its body.
    if (response.ok) {
      log.info('submitted to Canvas ingest queue', {
        canvas_url,
        status: response.status,
      })
    }
    return res.status(response.status).json(responseBody)
  } catch (error) {
    log.error(
      'Canvas ingest submission failed',
      { canvas_url: req.body?.canvas_url },
      error,
    )
    return res.status(500).json({
      error: `❌❌ -- Bottom of /ingest -- Internal Server Error during ingest submission to Beam: ${error}`,
    })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
