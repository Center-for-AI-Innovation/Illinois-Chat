// GET /api/UIUC-api/siteStatus
// Public: every page polls this one request for the announcement banner and
// the maintenance flag. Returns only the renderable fields — never the
// updater's identity or the maintenance copy.

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  readAnnouncementBanner,
  readMaintenanceMode,
  toPublicAnnouncementBanner,
} from '~/utils/platformSettings.server'

// The poll is once a minute, so a shared cache may hold a success for at most
// 5s: an edge copy can delay a maintenance toggle by 5s, not by a whole poll.
// No stale-while-revalidate, which would serve the old flag past that bound.
// Browsers always revalidate.
export const SITE_STATUS_CACHE_CONTROL =
  'public, max-age=0, s-maxage=5, must-revalidate'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const [banner, maintenance] = await Promise.all([
    readAnnouncementBanner(),
    readMaintenanceMode(),
  ])

  // An error rather than a partial body: a missing half would read as a
  // default (no banner, not in maintenance) and overwrite the client's last
  // good state. Failures are never cached.
  if (banner.state === 'unavailable' || maintenance.state === 'unavailable') {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).json({ error: 'Site status is unavailable' })
  }

  res.setHeader('Cache-Control', SITE_STATUS_CACHE_CONTROL)
  return res.status(200).json({
    announcementBanner: toPublicAnnouncementBanner(banner),
    isMaintenanceMode: maintenance.value,
  })
}
