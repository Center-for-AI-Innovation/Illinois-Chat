import type { NextApiRequest, NextApiResponse } from 'next'
import { runPagesRoute } from '~/utils/server/routeContext'

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' })
  }

  // Extract the token (assuming Bearer token format)
  const token = authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  // Load any data your application needs for the API route
  return res.status(200).json({ userId: token })
}

export default async function isSignedInRoute(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  return runPagesRoute(req, res, () => handler(req, res))
}
