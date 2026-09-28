// GET /api/UIUC-api/navbarLogo?v=<version>
// Public: streams the uploaded navbar logo, or redirects to the built-in one.

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  DEFAULT_NAVBAR_LOGO_SRC,
  parseLogoDataUrl,
} from '~/utils/platformSettings.schema'
import { readNavbarLogo } from '~/utils/platformSettings.server'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const read = await readNavbarLogo()
  if (read.state === 'unavailable') {
    return res.status(503).json({ error: 'Navbar logo is unavailable' })
  }

  const parsed = read.value ? parseLogoDataUrl(read.value) : null
  if (!parsed) {
    res.setHeader('Cache-Control', 'no-store')
    return res.redirect(307, DEFAULT_NAVBAR_LOGO_SRC)
  }

  res.setHeader('Content-Type', parsed.contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // SVG is an active format: opened directly, it would run script on this
  // origin. The sandbox keeps it a picture.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  )
  // The navbar links a content-hashed `v`, so a new upload is a new URL.
  res.setHeader(
    'Cache-Control',
    typeof req.query.v === 'string'
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=60',
  )
  return res.status(200).send(Buffer.from(parsed.base64, 'base64'))
}
