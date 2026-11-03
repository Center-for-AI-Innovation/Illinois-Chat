// Request context and catch-all shared by the API route wrappers (withAuth,
// withAppRouterAuth and the withCourseAccessFromRequest variants).
//
// The outermost wrapper opens the context: it reads X-Request-ID or mints an
// id, writes a minted id back onto the request for downstream readers, and
// sends the id back in the X-Request-ID response header. A wrapper nested
// inside another reuses the open context, so a project name set by the outer
// one is kept. Anything the handler throws ends here as one ERROR line and a
// 500, or a 503 when the project metadata store is down.
// Server-only by convention.
import type { NextApiRequest, NextApiResponse } from 'next'
import { type NextRequest, NextResponse } from 'next/server'
import { getLogger } from './log'
import {
  MetadataUnavailableError,
  getLogContext,
  getRequestId,
  runWithLogContext,
} from './requestContext'

const log = getLogger('api')

function routeError(err: unknown): {
  status: number
  body: { error: string; message: string }
} {
  if (err instanceof MetadataUnavailableError) {
    log.error('project metadata store unavailable', undefined, err)
    return {
      status: 503,
      body: {
        error: 'Project metadata store unavailable',
        message: 'Project settings could not be loaded. Try again shortly.',
      },
    }
  }
  log.error('unhandled error in API route', undefined, err)
  return {
    status: 500,
    body: {
      error: 'Internal server error',
      message: 'The server hit an unexpected error.',
    },
  }
}

export async function runPagesRoute(
  req: NextApiRequest,
  res: NextApiResponse,
  run: () => Promise<unknown> | unknown,
): Promise<void> {
  const guarded = async (): Promise<void> => {
    try {
      await run()
    } catch (err) {
      const { status, body } = routeError(err)
      // A handler that already started a response cannot change its status.
      if (res.headersSent) res.end()
      else res.status(status).json(body)
    }
  }
  if (getLogContext()) return guarded()

  const rid = getRequestId(req)
  req.headers['x-request-id'] = rid
  // Before the handler runs: once it sends, Node refuses new headers.
  res.setHeader('X-Request-ID', rid)
  return runWithLogContext({ rid, path: req.url?.split('?')[0] }, guarded)
}

export async function runAppRoute(
  req: NextRequest,
  run: () => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> {
  const existing = getLogContext()
  const rid = existing?.rid ?? getRequestId(req)

  const guarded = async (): Promise<NextResponse> => {
    let response: NextResponse
    try {
      response = await run()
    } catch (err) {
      const { status, body } = routeError(err)
      response = NextResponse.json(body, { status })
    }
    try {
      response.headers.set('X-Request-ID', rid)
    } catch {
      // Immutable headers (e.g. Response.redirect): the id is still in the logs.
    }
    return response
  }
  if (existing) return guarded()

  try {
    req.headers.set('x-request-id', rid)
  } catch {
    // Read-only request headers: handlers read the id from the context instead.
  }
  return runWithLogContext({ rid, path: req.nextUrl?.pathname }, guarded)
}
