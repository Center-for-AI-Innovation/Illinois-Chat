import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { sendTransactionalEmail } from '~/utils/sendTransactionalEmail'
import { withCourseOwnerOrAdminAccess } from '~/pages/api/authorization'

const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  try {
    if (req.method !== 'POST') {
      console.error('Request method not allowed')
      return res.status(405).json({ error: '❌❌ Request method not allowed' })
    }

    const { courseName, canvas_url, selectedCanvasOptions } = req.body

    console.log(
      '👉 Submitting to Canvas ingest queue:',
      canvas_url,
      courseName,
      selectedCanvasOptions,
    )

    if (!courseName || !canvas_url) {
      console.error('Missing body parameters')
      return res.status(400).json({ error: '❌❌ Missing body parameters' })
    }

    try {
      await sendTransactionalEmail({
        sender: process.env.EMAIL_SENDER || 'rohan13@illinois.edu',
        recipients: ['rohan13@illinois.edu'],
        bccRecipients: [],
        subject: 'New Canvas Course Ingestion Request',
        bodyText: `New Canvas course ingestion request received:
Course Name: ${courseName}
Canvas URL: ${canvas_url}
Selected Options: ${selectedCanvasOptions.join(', ')}
Please review and approve at https://canvas.illinois.edu/ using account uiuc.chat@ad.uillinois.edu.`,
      })
    } catch (emailError) {
      console.error('Email API failed:', emailError)
    }

    const response = await fetch(
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
    console.log(
      `📤 Submitted to ingest queue: ${canvas_url}. Response status: ${response.status}`,
      responseBody,
    )
    return res.status(response.status).json(responseBody)
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      error: `❌❌ -- Bottom of /ingest -- Internal Server Error during ingest submission to Beam: ${error}`,
    })
  }
}

export default withCourseOwnerOrAdminAccess()(handler)
