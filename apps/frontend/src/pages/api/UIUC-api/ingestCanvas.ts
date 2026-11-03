import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { getBackendUrl } from '~/utils/apiUtils'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { REQUEST_ID_HEADER, requestIdFromHeaders } from '~/utils/requestId'

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  // One id for the browser, this route, the backend and the worker.
  const requestId = requestIdFromHeaders(req.headers)
  res.setHeader(REQUEST_ID_HEADER, requestId)
  try {
    if (req.method !== 'POST') {
      console.error('Request method not allowed')
      return res.status(405).json({ error: '❌❌ Request method not allowed' })
    }

    const { courseName, canvas_url, selectedCanvasOptions } = req.body

    console.log(
      `👉 Submitting to Canvas ingest queue rid=${requestId}:`,
      canvas_url,
      courseName,
      selectedCanvasOptions,
    )

    if (!courseName || !canvas_url) {
      console.error('Missing body parameters')
      return res.status(400).json({ error: '❌❌ Missing body parameters' })
    }

    console.log('About to send transactional email')

    // Send email to kastan alerting that he needs to approve a canvas course
    const sendEmailResponse = await fetch(
      `${getBackendUrl()}/send-transactional-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [REQUEST_ID_HEADER]: requestId,
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
    // Add error checking for the response
    if (!sendEmailResponse.ok) {
      console.error(
        `Email API responded with status: ${sendEmailResponse.status}`,
      )
    }
    // console.debug("Sent email to Kastan to alert him of new Canvas ingest")

    const response = await fetch(
      `${process.env.INGEST_URL}`.replace('/ingest', '/canvas_ingest'),
      {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          [REQUEST_ID_HEADER]: requestId,
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
    console.log(
      `📤 Submitted to ingest queue rid=${requestId}: ${canvas_url}. Response status: ${response.status}`,
      responseBody,
    )
    return res.status(response.status).json(responseBody)
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      error: `❌❌ -- Bottom of /ingest rid=${requestId} -- Internal Server Error during ingest submission to Beam: ${error}`,
    })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
