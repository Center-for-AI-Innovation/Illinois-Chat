/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { NextResponse } from 'next/server'

describe('withAppRouterAuth', () => {
  it('returns 401 when token cookie is missing', async () => {
    vi.doMock('../keycloakClient', () => ({
      verifyTokenAsync: vi.fn(),
    }))
    vi.doMock('~/utils/authHelpers', () => ({
      getKeycloakBaseFromHost: vi.fn(() => 'https://kc/'),
      getKeycloakIssuerUrl: vi.fn(() => 'https://kc/realms/test'),
    }))

    vi.resetModules()
    const { withAppRouterAuth } = await import('../appRouterAuth')

    const handler = vi.fn(() => NextResponse.json({ ok: true }))
    const wrapped = withAppRouterAuth(handler as any)

    const req: any = { headers: new Headers() }
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: 'Missing token' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('attaches user and calls handler when token verifies', async () => {
    const verifyTokenAsync = vi.fn().mockResolvedValue({ sub: 'u1' })
    const getKeycloakBaseFromHost = vi.fn(() => 'https://kc/')
    const getKeycloakIssuerUrl = vi.fn(() => 'https://kc/realms/test')
    vi.doMock('../keycloakClient', () => ({ verifyTokenAsync }))
    vi.doMock('~/utils/authHelpers', () => ({
      getKeycloakBaseFromHost,
      getKeycloakIssuerUrl,
    }))

    vi.resetModules()
    const { withAppRouterAuth } = await import('../appRouterAuth')

    const handler = vi.fn((req: any) => NextResponse.json({ user: req.user }))
    const wrapped = withAppRouterAuth(handler as any)

    const req: any = {
      headers: new Headers({
        cookie: 'access_token=t',
        host: 'example.com:3000',
      }),
    }

    const res = await wrapped(req)
    expect(getKeycloakBaseFromHost).toHaveBeenCalledWith('example.com')
    expect(getKeycloakIssuerUrl).toHaveBeenCalledWith('example.com')
    expect(verifyTokenAsync).toHaveBeenCalledWith(
      't',
      'https://kc/',
      'https://kc/realms/test',
    )
    await expect(res.json()).resolves.toMatchObject({ user: { sub: 'u1' } })
  })

  it('returns 401 TokenExpiredError when token is expired', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const verifyTokenAsync = vi
      .fn()
      .mockRejectedValue(
        new (jwt as any).TokenExpiredError('expired', new Date()),
      )
    vi.doMock('../keycloakClient', () => ({ verifyTokenAsync }))
    vi.doMock('~/utils/authHelpers', () => ({
      getKeycloakBaseFromHost: vi.fn(() => 'https://kc/'),
      getKeycloakIssuerUrl: vi.fn(() => 'https://kc/realms/test'),
    }))

    vi.resetModules()
    const { withAppRouterAuth } = await import('../appRouterAuth')

    const wrapped = withAppRouterAuth((() =>
      NextResponse.json({ ok: true })) as any)
    const req: any = {
      headers: new Headers({ cookie: 'access_token=t' }),
    }
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: 'Token expired' })
  })

  it('returns 401 JsonWebTokenError when token is invalid', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const verifyTokenAsync = vi
      .fn()
      .mockRejectedValue(new (jwt as any).JsonWebTokenError('bad token'))
    vi.doMock('../keycloakClient', () => ({ verifyTokenAsync }))
    vi.doMock('~/utils/authHelpers', () => ({
      getKeycloakBaseFromHost: vi.fn(() => 'https://kc/'),
      getKeycloakIssuerUrl: vi.fn(() => 'https://kc/realms/test'),
    }))

    vi.resetModules()
    const { withAppRouterAuth } = await import('../appRouterAuth')

    const wrapped = withAppRouterAuth((() =>
      NextResponse.json({ ok: true })) as any)
    const req: any = {
      headers: new Headers({ cookie: 'access_token=t' }),
    }
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: 'Invalid token' })
  })

  it('returns 401 authentication failed for unexpected errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const verifyTokenAsync = vi.fn().mockRejectedValue(new Error('boom'))
    vi.doMock('../keycloakClient', () => ({ verifyTokenAsync }))
    vi.doMock('~/utils/authHelpers', () => ({
      getKeycloakBaseFromHost: vi.fn(() => 'https://kc/'),
      getKeycloakIssuerUrl: vi.fn(() => 'https://kc/realms/test'),
    }))

    vi.resetModules()
    const { withAppRouterAuth } = await import('../appRouterAuth')

    const wrapped = withAppRouterAuth((() =>
      NextResponse.json({ ok: true })) as any)
    const req: any = {
      headers: new Headers({ cookie: 'access_token=t' }),
    }
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Authentication failed',
    })
  })
})

describe('withAppRouterAuth request context', () => {
  function mockVerifiedAuth(user: unknown = { sub: 'u1' }) {
    vi.doMock('../keycloakClient', () => ({
      verifyTokenAsync: vi.fn().mockResolvedValue(user),
    }))
    vi.doMock('~/utils/authHelpers', () => ({
      getKeycloakBaseFromHost: vi.fn(() => 'https://kc/'),
      getKeycloakIssuerUrl: vi.fn(() => 'https://kc/realms/test'),
    }))
    vi.resetModules()
  }

  function authedReq(extra: Record<string, string> = {}): any {
    return {
      headers: new Headers({ cookie: 'access_token=t', ...extra }),
      nextUrl: { pathname: '/api/chat/openai' },
    }
  }

  it('a throwing handler returns 500, not 401', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockVerifiedAuth()
    const { withAppRouterAuth } = await import('../appRouterAuth')

    const wrapped = withAppRouterAuth(async () => {
      throw new Error('handler bug')
    })
    const res = await wrapped(authedReq())
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Internal server error',
    })
    expect(error).toHaveBeenCalledTimes(1)
    const line = error.mock.calls[0]![0] as string
    expect(line).toMatch(
      / ERROR   api rid=\S+ path=\/api\/chat\/openai unhandled error in API route\nError: handler bug\n/,
    )
    expect(line).not.toContain('JWT')
  })

  it('MetadataUnavailableError from the handler returns 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockVerifiedAuth()
    const { withAppRouterAuth } = await import('../appRouterAuth')
    const { MetadataUnavailableError } =
      await import('~/utils/server/requestContext')
    const res = await withAppRouterAuth(async () => {
      throw new MetadataUnavailableError('ece120', new Error('down'))
    })(authedReq())
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Project metadata store unavailable',
    })
  })

  it('echoes an incoming X-Request-ID on the response', async () => {
    mockVerifiedAuth()
    const { withAppRouterAuth } = await import('../appRouterAuth')
    const res = await withAppRouterAuth(() => NextResponse.json({ ok: true }))(
      authedReq({ 'x-request-id': 'abc123' }),
    )
    expect(res.headers.get('X-Request-ID')).toBe('abc123')
  })

  it('writes a minted id back onto the request headers, also on a 401', async () => {
    mockVerifiedAuth()
    const { withAppRouterAuth } = await import('../appRouterAuth')
    const req: any = { headers: new Headers() }
    const res = await withAppRouterAuth(() => NextResponse.json({}))(req)
    expect(res.status).toBe(401)
    const rid = req.headers.get('x-request-id')
    expect(rid).toMatch(/^[0-9a-f]{12}$/)
    expect(res.headers.get('X-Request-ID')).toBe(rid)
  })

  it('reuses an existing log context and keeps its course', async () => {
    mockVerifiedAuth()
    const { withAppRouterAuth } = await import('../appRouterAuth')
    const { getLogContext, runWithLogContext } =
      await import('~/utils/server/requestContext')
    const req = authedReq()
    let seen: unknown
    const res = await runWithLogContext(
      { rid: 'outer1', course: 'ece120' },
      () =>
        withAppRouterAuth(() => {
          seen = getLogContext()
          return NextResponse.json({})
        })(req),
    )
    expect(seen).toEqual({ rid: 'outer1', course: 'ece120' })
    expect(res.headers.get('X-Request-ID')).toBe('outer1')
    expect(req.headers.get('x-request-id')).toBeNull()
  })
})

describe('getUserIdentifier', () => {
  it('returns user.email when present', async () => {
    const { getUserIdentifier } = await import('../appRouterAuth')
    expect(
      getUserIdentifier({
        user: { email: 'u@example.com' },
        headers: new Headers(),
      } as any),
    ).toBe('u@example.com')
  })

  it('falls back to x-user-email, then x-posthog-id, then null', async () => {
    const { getUserIdentifier } = await import('../appRouterAuth')

    expect(
      getUserIdentifier({
        headers: new Headers({ 'x-user-email': 'header@example.com' }),
      } as any),
    ).toBe('header@example.com')

    expect(
      getUserIdentifier({
        headers: new Headers({ 'x-posthog-id': 'ph_123' }),
      } as any),
    ).toBe('ph_123')

    expect(getUserIdentifier({ headers: new Headers() } as any)).toBeNull()
  })
})
