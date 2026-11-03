import { type NextApiResponse } from 'next'
import { withAuth, AuthenticatedRequest } from '~/utils/authMiddleware'
import { db } from '~/db/dbClient'
import { emailNewsletter } from '~/db/schema'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.newsletterUnsubscribe')

const newsletterUnsubscribe = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
) => {
  const { email } = req.body

  try {
    const result = await db
      .insert(emailNewsletter)
      .values({
        email: email,
        unsubscribedFromNewsletter: true,
      })
      .onConflictDoUpdate({
        target: [emailNewsletter.email],
        set: {
          unsubscribedFromNewsletter: true,
        },
      })
  } catch (error: any) {
    log.error('failed to save the newsletter unsubscribe', undefined, error)
    return res.status(500).json({ success: false, error: error })
  }
  return res.status(200).json({ success: true })
}

export default withAuth(newsletterUnsubscribe)
