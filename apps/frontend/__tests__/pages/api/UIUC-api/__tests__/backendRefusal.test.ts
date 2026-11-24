import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockReq, createMockRes } from '~/test-utils/nextApi'

// A 401 or 403 from the backend is about the key or the network between our
// two services, not about the user. Each route that passes the status of the
// backend on to the browser must answer 502 for it (statusForBrowser).

const hoisted = vi.hoisted(() => ({ checkCourseExists: vi.fn() }))

vi.mock('~/server/authorization', () => ({
  withCourseOwnerOrAdminAccess: () => (h: any) => h,
  withCourseAccessFromRequest: () => (h: any) => h,
}))

vi.mock('~/utils/authMiddleware', () => ({
  withAuth: (h: any) => h,
}))

vi.mock('~/pages/api/UIUC-api/getCourseExists', () => ({
  checkCourseExists: hoisted.checkCourseExists,
}))

vi.mock('~/utils/apiUtils', () => ({
  getBackendUrl: () => 'http://backend',
}))

import createProject from '~/pages/api/UIUC-api/createProject'
import deleteDocument from '~/pages/api/UIUC-api/deleteDocument'
import downloadConvoHistoryUser from '~/pages/api/UIUC-api/downloadConvoHistoryUser'
import downloadMITCourse from '~/pages/api/UIUC-api/downloadMITCourse'
import getAllCourseData from '~/pages/api/UIUC-api/getAllCourseData'
import getModelUsageCounts from '~/pages/api/UIUC-api/getModelUsageCounts'
import getProjectStats from '~/pages/api/UIUC-api/getProjectStats'
import getWeeklyTrends from '~/pages/api/UIUC-api/getWeeklyTrends'
import ingestCanvas from '~/pages/api/UIUC-api/ingestCanvas'

type Handler = (req: any, res: any) => unknown

// For each route: a request that gets as far as the backend call, and how many
// backend calls answer 200 before the one whose status the route passes on.
const routes: [string, Handler, Record<string, unknown>, number][] = [
  [
    'createProject',
    createProject,
    {
      method: 'POST',
      body: { project_name: 'CS101', project_owner_email: 'o@example.com' },
    },
    0,
  ],
  [
    'deleteDocument',
    deleteDocument,
    { method: 'DELETE', query: { course_name: 'CS101', s3_path: 'a.pdf' } },
    0,
  ],
  [
    'downloadConvoHistoryUser',
    downloadConvoHistoryUser,
    {
      method: 'GET',
      query: { projectName: 'CS101' },
      user: { email: 'u@example.com' },
    },
    0,
  ],
  [
    'downloadMITCourse',
    downloadMITCourse,
    {
      method: 'GET',
      query: { url: 'u', course_name: 'CS101', local_dir: 'd' },
    },
    0,
  ],
  [
    'getAllCourseData',
    getAllCourseData,
    { method: 'GET', query: { course_name: 'CS101' } },
    0,
  ],
  [
    'getModelUsageCounts',
    getModelUsageCounts,
    { method: 'POST', body: { project_name: 'CS101' } },
    0,
  ],
  [
    'getProjectStats',
    getProjectStats,
    { method: 'POST', body: { project_name: 'CS101' } },
    0,
  ],
  [
    'getWeeklyTrends',
    getWeeklyTrends,
    { method: 'POST', body: { project_name: 'CS101' } },
    0,
  ],
  [
    // The first backend call of this route sends an email; the second one is
    // the import, and its status is passed on.
    'ingestCanvas',
    ingestCanvas,
    {
      method: 'POST',
      body: {
        courseName: 'CS101',
        canvas_url: 'https://canvas.illinois.edu/courses/1',
        selectedCanvasOptions: ['files'],
      },
    },
    1,
  ],
]

describe('a 401 or 403 from the backend', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const call = async (
    handler: Handler,
    request: Record<string, unknown>,
    okCallsFirst: number,
    backendStatus: number,
  ) => {
    hoisted.checkCourseExists.mockResolvedValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    for (let i = 0; i < okCallsFirst; i++) {
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    }
    fetchSpy.mockResolvedValueOnce(
      new Response('{"error":"refused"}', { status: backendStatus }),
    )
    const res = createMockRes()
    await handler(createMockReq(request) as any, res as any)
    expect(fetchSpy).toHaveBeenCalledTimes(okCallsFirst + 1)
    return res
  }

  it.each(routes)(
    '%s answers 502 for a 401 and for a 403',
    async (_name, handler, request, okCallsFirst) => {
      for (const backendStatus of [401, 403]) {
        const res = await call(handler, request, okCallsFirst, backendStatus)
        expect(res.status).toHaveBeenCalledWith(502)
        expect(res.status).not.toHaveBeenCalledWith(backendStatus)
        vi.restoreAllMocks()
      }
    },
  )

  it.each(routes)(
    '%s still passes a 500 on as it is',
    async (_name, handler, request, okCallsFirst) => {
      const res = await call(handler, request, okCallsFirst, 500)
      expect(res.status).toHaveBeenCalledWith(500)
    },
  )
})
