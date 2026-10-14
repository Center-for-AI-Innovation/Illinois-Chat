// GET /api/UIUC-api/announcementBanner
// Public: the home page polls this so an open tab picks up banner changes
// without a reload. Returns only the renderable fields.

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  readAnnouncementBanner,
  toPublicAnnouncementBanner,
} from '~/utils/platformSettings.server'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Cache-Control', 'no-store')

  const read = await readAnnouncementBanner()
  // An error rather than `null`: null means "show the legacy banner", and a
  // Redis blip must not swap a live announcement for the old build-time one.
  if (read.state === 'unavailable') {
    return res.status(503).json({ error: 'Announcement banner is unavailable' })
  }

  return res.status(200).json({ banner: toPublicAnnouncementBanner(read) })
}
