import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { verifyTokenAsync } from './keycloakClient'
import {
  getKeycloakBaseFromHost,
  getKeycloakIssuerUrl,
} from '~/utils/authHelpers'
import { AuthenticatedUser } from '~/proxy'
import { getLogger } from '~/utils/server/log'
import { runPagesRoute } from '~/utils/server/routeContext'

const log = getLogger('api.auth')

function getTokenFromCookies(req: NextApiRequest): string | null {
  const raw = req.cookies['access_token']
  if (!raw) return null
  return raw
}

// jsonwebtoken reports a failed key lookup as a JsonWebTokenError with this
// prefix, so a Keycloak outage looks like a bad token unless it is told apart.
const KEY_LOOKUP_FAILED = 'error in secret or public key callback: '
// Key lookups that fail because of the token itself, not because of Keycloak.
const KEY_LOOKUP_TOKEN_FAULT = /Missing kid|Unable to find a signing key/

/** True when the token is at fault (expired, malformed, unknown key id). */
function isTokenProblem(error: unknown): error is jwt.JsonWebTokenError {
  if (!(error instanceof jwt.JsonWebTokenError)) return false
  if (!error.message.startsWith(KEY_LOOKUP_FAILED)) return true
  return KEY_LOOKUP_TOKEN_FAULT.test(error.message)
}

export interface AuthenticatedRequest extends NextApiRequest {
  user?: AuthenticatedUser
  courseName?: string
}

// Middleware to verify JWT token. Also opens the request's log context (or
// reuses an outer one) and turns anything the handler throws into a logged
// 500, so a handler bug is no longer reported as an authentication failure.
export function withAuth(
  handler: (
    req: AuthenticatedRequest,
    res: NextApiResponse,
  ) => Promise<void> | void,
) {
  return (req: AuthenticatedRequest, res: NextApiResponse) =>
    runPagesRoute(req, res, async () => {
      let decoded: AuthenticatedUser
      try {
        const token = getTokenFromCookies(req)

        if (!token) {
          return res.status(401).json({ error: 'Missing token' })
        }

        const rawHost = req.headers['x-forwarded-host'] ?? req.headers['host']
        const hostValue = Array.isArray(rawHost) ? rawHost[0] : rawHost

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
        // Keycloak did not give the signing key, or the check failed for a
        // reason that is not the token. A 401 here signs the user out in the
        // browser for an outage on our side, so answer 503.
        if (!isTokenProblem(error)) {
          log.error('could not verify the access token', undefined, error)
          return res.status(503).json({
            error: 'Authentication service unavailable',
            message: 'Your identity could not be verified. Try again shortly.',
          })
        }

        // Expired or malformed token: the client's problem, no stack needed.
        log.warn(`access token rejected: ${error.name}: ${error.message}`)

        if (error instanceof jwt.TokenExpiredError) {
          return res.status(401).json({
            error: 'Token expired',
            message: 'Your session has expired. Please log in again.',
          })
        }

        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid',
        })
      }

      // Add user to request object
      req.user = decoded

      // Call the original handler outside the token check: its errors are
      // not authentication failures.
      return await handler(req, res)
    })
}

// Utility function to check if user has specific role
export function hasRole(user: AuthenticatedUser, role: string): boolean {
  return user.realm_access?.roles?.includes(role) || false
}

// Utility function to check if user has any of the specified roles
export function hasAnyRole(user: AuthenticatedUser, roles: string[]): boolean {
  return roles.some((role) => hasRole(user, role))
}

// Middleware for role-based access control
export function withRole(requiredRole: string) {
  return function (
    handler: (
      req: AuthenticatedRequest,
      res: NextApiResponse,
    ) => Promise<void> | void,
  ) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' })
      }

      if (!hasRole(req.user, requiredRole)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This action requires the '${requiredRole}' role`,
        })
      }

      return await handler(req, res)
    })
  }
}

// Middleware for multiple role access control
export function withAnyRole(requiredRoles: string[]) {
  return function (
    handler: (
      req: AuthenticatedRequest,
      res: NextApiResponse,
    ) => Promise<void> | void,
  ) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' })
      }

      if (!hasAnyRole(req.user, requiredRoles)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
        })
      }

      return await handler(req, res)
    })
  }
}

// Public endpoints that don't require authentication
export const PUBLIC_ENDPOINTS = [
  '/api/healthcheck',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/auth/refresh',
]

// Check if endpoint is public
export function isPublicEndpoint(pathname: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => pathname.startsWith(endpoint))
}
