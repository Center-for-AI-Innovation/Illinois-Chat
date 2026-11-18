// GET /api/UIUC-api/siteStatus
// Public: every page polls this one request for the announcement banner and
// the maintenance flag. Returns only the renderable fields — never the
// updater's identity or the maintenance copy.
//
// `?fresh=<timestamp>` is the explicit refresh a tab sends right after saving
// settings. It is never cached, so the saving tab reads the origin's state
// rather than a shared-cache copy from before the save.

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  SITE_STATUS_CACHE_CONTROL,
  SITE_STATUS_FRESH_PARAM,
  SITE_STATUS_NO_STORE,
} from '~/utils/siteStatusCache'
import {
  readAnnouncementBanner,
  readMaintenanceMode,
  toPublicAnnouncementBanner,
} from '~/utils/platformSettings.server'

// Ordinary polls get the short shared cache from siteStatusCache.ts. Browsers
// always revalidate, and no stale-while-revalidate is sent, so a maintenance
// toggle reaches open tabs within one poll plus the shared-cache age.

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.setHeader('Cache-Control', SITE_STATUS_NO_STORE)
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
    res.setHeader('Cache-Control', SITE_STATUS_NO_STORE)
    return res.status(503).json({ error: 'Site status is unavailable' })
  }

  const isExplicitRefresh = req.query?.[SITE_STATUS_FRESH_PARAM] !== undefined
  res.setHeader(
    'Cache-Control',
    isExplicitRefresh ? SITE_STATUS_NO_STORE : SITE_STATUS_CACHE_CONTROL,
  )
  return res.status(200).json({
    announcementBanner: toPublicAnnouncementBanner(banner),
    isMaintenanceMode: maintenance.value,
  })
}
