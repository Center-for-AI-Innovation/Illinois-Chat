import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { ensureRedisConnected } from '~/utils/redisClient'
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.getMaintenanceModeFast')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const startTime = Date.now()
  try {
    // const redisStartTime = Date.now()
    const redisClient = await ensureRedisConnected()
    const maintenanceStatus = await redisClient.get('maintenance-mode')

    // console.log(`[getMaintenanceMode] Redis query took ${Date.now() - redisStartTime}ms`)

    res.status(200).json({
      isMaintenanceMode: maintenanceStatus === 'true',
    })
  } catch (error) {
    log.error(
      'failed to check maintenance mode',
      { ms: Date.now() - startTime },
      error,
    )
    res.status(500).json({ error: 'Failed to check maintenance mode' })
  }
}

export default handler
