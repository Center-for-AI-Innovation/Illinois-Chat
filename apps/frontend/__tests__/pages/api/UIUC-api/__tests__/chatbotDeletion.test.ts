/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

const hoisted = vi.hoisted(() => {
  class ChatbotDeletionConflictError extends Error {}
  return {
    getCourseMetadata: vi.fn(),
    isSuperAdmin: vi.fn(),
    startChatbotDeletion: vi.fn(),
    getExternalStores: vi.fn(),
    getLatestDeletion: vi.fn(),
    ChatbotDeletionConflictError,
  }
})

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: any) => h,
}))

vi.mock('~/server/authorization', () => ({
  getCourseMetadata: hoisted.getCourseMetadata,
  isCourseOwner: (user: { email: string }, md: { course_owner: string }) =>
    md.course_owner === user.email,
}))

vi.mock('~/utils/superAdmins', () => ({
  isSuperAdmin: hoisted.isSuperAdmin,
}))

vi.mock('~/server/chatbotDeletion', () => ({
  ChatbotDeletionConflictError: hoisted.ChatbotDeletionConflictError,
  startChatbotDeletion: hoisted.startChatbotDeletion,
  getExternalStores: hoisted.getExternalStores,
  getLatestDeletion: hoisted.getLatestDeletion,
}))

import handler from '~/pages/api/UIUC-api/chatbotDeletion'

const OWNER = 'owner@illinois.edu'
const metadata = { course_owner: OWNER, course_admins: ['admin@illinois.edu'] }
const deletionRow = {
  id: 7,
  project_name: 'bot',
  status: 'pending',
  include_external: false,
  progress: {},
  error: null,
  created_at: '2026-10-15T00:00:00Z',
  completed_at: null,
  requested_by: OWNER,
  metadata_backup: { secret: 'stays server side' },
}

function post(email: string, body: Record<string, unknown>) {
  return createMockReq({ method: 'POST', user: { email }, body })
}

describe('UIUC-api/chatbotDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.isSuperAdmin.mockReturnValue(false)
    hoisted.getCourseMetadata.mockResolvedValue(metadata)
    hoisted.startChatbotDeletion.mockResolvedValue({
      deletion: deletionRow,
      queued: true,
    })
  })

  it('rejects unauthenticated requests and unsupported methods', async () => {
    const res1 = createMockRes()
    await handler(createMockReq({ method: 'POST' }) as any, res1 as any)
    expect(res1.status).toHaveBeenCalledWith(401)

    const res2 = createMockRes()
    await handler(
      createMockReq({ method: 'DELETE', user: { email: OWNER } }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(405)
  })

  it('starts the deletion for the owner and returns 202 without the backup', async () => {
    const res = createMockRes()
    await handler(
      post(OWNER, {
        course_name: 'bot',
        confirm_name: 'bot',
        include_external: true,
      }) as any,
      res as any,
    )

    expect(hoisted.startChatbotDeletion).toHaveBeenCalledWith({
      courseName: 'bot',
      metadata,
      requestedBy: OWNER,
      includeExternal: true,
    })
    expect(res.status).toHaveBeenCalledWith(202)
    const body = res.json.mock.calls[0]![0]
    expect(body.queued).toBe(true)
    expect(body.deletion.id).toBe(7)
    expect(body.deletion).not.toHaveProperty('metadata_backup')
  })

  it('only treats include_external === true as opting in', async () => {
    const res = createMockRes()
    await handler(
      post(OWNER, {
        course_name: 'bot',
        confirm_name: 'bot',
        include_external: 'true',
      }) as any,
      res as any,
    )
    expect(hoisted.startChatbotDeletion).toHaveBeenCalledWith(
      expect.objectContaining({ includeExternal: false }),
    )
  })

  it('refuses course admins who are not the owner', async () => {
    const res = createMockRes()
    await handler(
      post('admin@illinois.edu', {
        course_name: 'bot',
        confirm_name: 'bot',
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(403)
    expect(hoisted.startChatbotDeletion).not.toHaveBeenCalled()
  })

  it('lets a super admin delete, even a frozen chatbot', async () => {
    hoisted.isSuperAdmin.mockReturnValue(true)
    hoisted.getCourseMetadata.mockResolvedValue({
      ...metadata,
      is_frozen: true,
    })
    const res = createMockRes()
    await handler(
      post('root@illinois.edu', {
        course_name: 'bot',
        confirm_name: 'bot',
      }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(202)
  })

  it('refuses the owner of a frozen chatbot', async () => {
    hoisted.getCourseMetadata.mockResolvedValue({
      ...metadata,
      is_frozen: true,
    })
    const res = createMockRes()
    await handler(
      post(OWNER, { course_name: 'bot', confirm_name: 'bot' }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('requires the typed name to match', async () => {
    const res = createMockRes()
    await handler(
      post(OWNER, { course_name: 'bot', confirm_name: 'Bot' }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(hoisted.startChatbotDeletion).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown chatbot and 409 when already deleting', async () => {
    hoisted.getCourseMetadata.mockResolvedValueOnce(null)
    const res1 = createMockRes()
    await handler(
      post(OWNER, { course_name: 'gone', confirm_name: 'gone' }) as any,
      res1 as any,
    )
    expect(res1.status).toHaveBeenCalledWith(404)

    hoisted.startChatbotDeletion.mockRejectedValueOnce(
      new hoisted.ChatbotDeletionConflictError('busy'),
    )
    const res2 = createMockRes()
    await handler(
      post(OWNER, { course_name: 'bot', confirm_name: 'bot' }) as any,
      res2 as any,
    )
    expect(res2.status).toHaveBeenCalledWith(409)
  })

  it('returns 500 when starting the deletion fails', async () => {
    hoisted.startChatbotDeletion.mockRejectedValueOnce(new Error('redis down'))
    const res = createMockRes()
    await handler(
      post(OWNER, { course_name: 'bot', confirm_name: 'bot' }) as any,
      res as any,
    )
    expect(res.status).toHaveBeenCalledWith(500)
  })

  describe('GET', () => {
    function get(email: string) {
      return createMockReq({
        method: 'GET',
        user: { email },
        query: { course_name: 'bot' },
      })
    }

    it('returns the configured external stores to the owner', async () => {
      hoisted.getExternalStores.mockResolvedValue(['database', 's3'])
      hoisted.getLatestDeletion.mockResolvedValue(null)
      const res = createMockRes()
      await handler(get(OWNER) as any, res as any)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        external_stores: ['database', 's3'],
        deletion: null,
      })
    })

    it('hides a live chatbot from non-owners', async () => {
      const res = createMockRes()
      await handler(get('someone@illinois.edu') as any, res as any)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('shows the requester the status after the metadata is gone', async () => {
      hoisted.getCourseMetadata.mockResolvedValue(null)
      hoisted.getLatestDeletion.mockResolvedValue(deletionRow)

      const res1 = createMockRes()
      await handler(get(OWNER) as any, res1 as any)
      expect(res1.status).toHaveBeenCalledWith(200)
      expect(res1.json.mock.calls[0]![0].deletion.status).toBe('pending')

      const res2 = createMockRes()
      await handler(get('someone@illinois.edu') as any, res2 as any)
      expect(res2.status).toHaveBeenCalledWith(404)
    })
  })
})
