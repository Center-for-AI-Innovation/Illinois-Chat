import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { ensureRedisConnected } from '~/utils/redisClient'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.getMaintenanceModeDetails')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const startTime = Date.now()
  try {
    // const redisStartTime = Date.now()
    const redisClient = await ensureRedisConnected()
    const [titleText, bodyText] = await Promise.all([
      // redisClient.get('maintenance-mode'),
      redisClient.get('maintenance-title-text'),
      redisClient.get('maintenance-body-text'),
    ])
    // console.log(`[getMaintenanceModeDetails] Redis query took ${Date.now() - redisStartTime}ms`)

    res.status(200).json({
      // isMaintenanceMode: maintenanceStatus === 'true',
      maintenanceTitleText: titleText,
      maintenanceBodyText: bodyText,
    })
  } catch (error) {
    log.error(
      'failed to read maintenance mode details',
      { ms: Date.now() - startTime },
      error,
    )
    res.status(500).json({ error: 'Failed to check maintenance mode' })
  }
}

export default withAuth(handler)
