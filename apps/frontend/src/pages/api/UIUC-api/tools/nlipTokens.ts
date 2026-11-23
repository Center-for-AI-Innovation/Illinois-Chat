import type { NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { withCourseOwnerOrAdminAccess } from '~/server/authorization'
import { nlipTokenNameSchema } from '~/types/nlip'
import {
  createInboundToken,
  listInboundTokens,
  MAX_NLIP_TOKENS,
  revokeInboundToken,
} from '~/server/nlip/tokens'

// Owners and admins manage the tokens other agents use to query this project.
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const project = req.courseName
  if (typeof project !== 'string' || !project)
    return res.status(400).json({ error: 'course_name is required' })
  try {
    if (req.method === 'GET')
      return res.json({ tokens: await listInboundTokens(project) })
    if (req.method === 'POST') {
      const name = nlipTokenNameSchema.safeParse(req.body?.name)
      if (!name.success)
        return res
          .status(400)
          .json({ error: 'Token name must be 1–64 characters' })
      const created = await createInboundToken(project, name.data)
      if (!created)
        return res.status(400).json({
          error: `A project can have at most ${MAX_NLIP_TOKENS} NLIP tokens`,
        })
      // The plain token is returned only in this response.
      return res.json(created)
    }
    if (req.method === 'DELETE') {
      const id = req.body?.id
      if (typeof id !== 'string' || !id)
        return res.status(400).json({ error: 'Token id is required' })
      await revokeInboundToken(project, id)
      return res.json({ success: true })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch {
    return res
      .status(503)
      .json({ error: 'Could not update NLIP tokens; check Redis availability' })
  }
}
export default withCourseOwnerOrAdminAccess()(handler)
