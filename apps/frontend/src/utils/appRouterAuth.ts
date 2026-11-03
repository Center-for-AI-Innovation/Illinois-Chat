import jwt from 'jsonwebtoken'
import { type AuthenticatedUser } from '~/proxy'
import { type NextRequest, NextResponse } from 'next/server'
import {
  getKeycloakBaseFromHost,
  getKeycloakIssuerUrl,
} from '~/utils/authHelpers'
import { verifyTokenAsync } from './keycloakClient'
import { getLogger } from '~/utils/server/log'
import { runAppRoute } from '~/utils/server/routeContext'

const log = getLogger('api.auth')

function getTokenFromCookies(req: NextRequest): string | null {
  // Find oidc.user* cookie
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const [name, value] = cookie.trim().split('=')
      if (name) acc[name] = value ?? ''
      return acc
    },
    {} as Record<string, string>,
  )

  const raw = cookies['access_token']
  if (!raw) return null
  return raw
}

export interface AuthenticatedRequest extends NextRequest {
  user?: AuthenticatedUser
  // The single project name the access check resolved and authorized. Handlers
  // must use this, never their own copy from the query or body (#312).
  courseName?: string
}

export function getUserIdentifier(req: AuthenticatedRequest): string | null {
  const userEmail = req.user?.email as string | undefined
  if (userEmail && userEmail.trim() !== '') {
    return userEmail
  }

  const headerEmail = req.headers.get('x-user-email')
  if (headerEmail && headerEmail.trim() !== '') {
    return headerEmail
  }

  const posthogId = req.headers.get('x-posthog-id')
  if (posthogId && posthogId.trim() !== '') {
    return posthogId
  }

  return null
}

// Authentication wrapper for App Router API routes. Also opens the request's
// log context (or reuses an outer one) and turns anything the handler throws
// into a logged 500, so a handler bug is no longer reported as an
// authentication failure.
export function withAppRouterAuth(
  handler: (req: AuthenticatedRequest) => Promise<NextResponse> | NextResponse,
) {
  return (req: NextRequest): Promise<NextResponse> =>
    runAppRoute(req, async () => {
      let decoded: AuthenticatedUser
      try {
        const token = getTokenFromCookies(req)

        if (!token) {
          return NextResponse.json({ error: 'Missing token' }, { status: 401 })
        }

        const rawHost =
          req.headers.get('x-forwarded-host') ?? req.headers.get('host')
        const hostValue = Array.isArray(rawHost) ? rawHost[0] : rawHost

        log.debug('resolving Keycloak issuer', { host: hostValue })

        // Fallback to 'localhost' if undefined
        const hostname = (hostValue ?? 'localhost').split(':')[0]
        const keycloakBaseUrl = getKeycloakBaseFromHost(hostname)
        const issuerUrl = getKeycloakIssuerUrl(hostname)

        // Verify JWT token using Keycloak's JWKS endpoint
        decoded = (await verifyTokenAsync(
          token,
          keycloakBaseUrl,
          issuerUrl,
        )) as AuthenticatedUser
      } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
          // Expired or malformed token: the client's problem, no stack needed.
          log.warn(`access token rejected: ${error.name}: ${error.message}`)
        } else {
          log.error('could not verify the access token', undefined, error)
        }

        if (error instanceof jwt.TokenExpiredError) {
          return NextResponse.json(
            {
              error: 'Token expired',
              message: 'Your session has expired. Please log in again.',
            },
            { status: 401 },
          )
        }

        if (error instanceof jwt.JsonWebTokenError) {
          return NextResponse.json(
            {
              error: 'Invalid token',
              message: 'The provided token is invalid',
            },
            { status: 401 },
          )
        }

        return NextResponse.json(
          {
            error: 'Authentication failed',
            message: 'Unable to verify your identity',
          },
          { status: 401 },
        )
      }

      // Add user to request object
      const authenticatedReq = req as AuthenticatedRequest
      authenticatedReq.user = decoded

      // Call the original handler outside the token check: its errors are
      // not authentication failures.
      return await handler(authenticatedReq)
    })
}
