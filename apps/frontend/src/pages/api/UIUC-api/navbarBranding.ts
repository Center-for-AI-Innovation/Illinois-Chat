// GET /api/UIUC-api/navbarBranding
// Public: every page's navbar reads the configured wordmark and logo URL from
// here. The logo bytes are served separately by ./navbarLogo.

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  readNavbarBranding,
  toPublicNavbarBranding,
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

  const read = await readNavbarBranding()
  // An error rather than the defaults: a Redis blip must not swap a custom
  // brand back to Illinois Chat in tabs that already have the real one.
  if (read.state === 'unavailable') {
    return res.status(503).json({ error: 'Navbar branding is unavailable' })
  }

  return res.status(200).json({ branding: toPublicNavbarBranding(read) })
}
