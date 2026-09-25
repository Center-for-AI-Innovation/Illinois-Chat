/* @vitest-environment node */

// The ordering inside isSuperAdminAsync is the safety property: the env
// allowlist is consulted first so a Redis outage degrades to the env answer.
// If Redis were the only source of truth and it went down, nobody could reach
// /admin to fix it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  readSuperAdminGrants: vi.fn(),
  addSuperAdminGrant: vi.fn(),
  removeSuperAdminGrant: vi.fn(),
}))

vi.mock('~/utils/platformSettings.server', () => ({
  readSuperAdminGrants: hoisted.readSuperAdminGrants,
  addSuperAdminGrant: hoisted.addSuperAdminGrant,
  removeSuperAdminGrant: hoisted.removeSuperAdminGrant,
}))

function grants(...emails: string[]) {
  hoisted.readSuperAdminGrants.mockResolvedValue({
    state: 'configured',
    value: emails,
  })
}

function grantsUnavailable() {
  hoisted.readSuperAdminGrants.mockResolvedValue({
    state: 'unavailable',
    reason: 'ECONNREFUSED',
  })
}

async function load(envAdmins = '') {
  vi.resetModules()
  vi.stubEnv('SUPER_ADMIN_EMAILS', envAdmins)
  vi.stubEnv('NEXT_PUBLIC_SUPER_ADMIN_EMAILS', '')
  return import('~/utils/superAdmins.server')
}

beforeEach(() => {
  hoisted.readSuperAdminGrants.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isSuperAdminAsync', () => {
  it('admits an env admin without reading Redis at all', async () => {
    grants()
    const { isSuperAdminAsync } = await load('env@example.com')

    expect(await isSuperAdminAsync('env@example.com')).toBe(true)
    expect(hoisted.readSuperAdminGrants).not.toHaveBeenCalled()
  })

  it('still admits an env admin when Redis is down', async () => {
    grantsUnavailable()
    const { isSuperAdminAsync } = await load('env@example.com')

    // The recovery floor. Without this an outage locks out every operator.
    expect(await isSuperAdminAsync('env@example.com')).toBe(true)
  })

  it('admits a Redis-granted admin', async () => {
    grants('granted@example.com')
    const { isSuperAdminAsync } = await load()

    expect(await isSuperAdminAsync('granted@example.com')).toBe(true)
  })

  it('declines a grant it cannot read', async () => {
    grantsUnavailable()
    const { isSuperAdminAsync } = await load()

    // Failing closed is right for the grant path specifically: the env answer
    // was already false, so this declines to confirm rather than denying
    // someone who has another route in.
    expect(await isSuperAdminAsync('granted@example.com')).toBe(false)
  })

  it('is case-insensitive on both sources', async () => {
    grants('granted@example.com')
    const { isSuperAdminAsync } = await load('ENV@example.com')

    expect(await isSuperAdminAsync('Env@Example.com')).toBe(true)
    expect(await isSuperAdminAsync('GRANTED@example.com')).toBe(true)
  })

  it('denies an unknown address', async () => {
    grants('granted@example.com')
    const { isSuperAdminAsync } = await load('env@example.com')

    expect(await isSuperAdminAsync('nobody@example.com')).toBe(false)
  })

  it('denies a missing email without reading Redis', async () => {
    grants('granted@example.com')
    const { isSuperAdminAsync } = await load()

    expect(await isSuperAdminAsync(undefined)).toBe(false)
    expect(await isSuperAdminAsync(null)).toBe(false)
    expect(await isSuperAdminAsync('')).toBe(false)
    expect(hoisted.readSuperAdminGrants).not.toHaveBeenCalled()
  })

  it('resolves the grant live on every call, so revocation is immediate', async () => {
    grants('granted@example.com')
    const { isSuperAdminAsync } = await load()

    expect(await isSuperAdminAsync('granted@example.com')).toBe(true)

    grants()
    expect(await isSuperAdminAsync('granted@example.com')).toBe(false)
  })
})

describe('readSuperAdminRoster', () => {
  it('splits the roster by source', async () => {
    grants('granted@example.com')
    const { readSuperAdminRoster } = await load('env@example.com')

    expect(await readSuperAdminRoster()).toEqual({
      envAdmins: ['env@example.com'],
      grantedAdmins: ['granted@example.com'],
    })
  })

  it('lists an address once when it is in both sources', async () => {
    grants('env@example.com', 'granted@example.com')
    const { readSuperAdminRoster } = await load('env@example.com')

    const roster = await readSuperAdminRoster()
    expect(roster.envAdmins).toEqual(['env@example.com'])
    // Excluded from the editable list, since removing the Redis copy would not
    // actually revoke anything.
    expect(roster.grantedAdmins).toEqual(['granted@example.com'])
  })

  it('warns instead of pretending the grants are empty', async () => {
    grantsUnavailable()
    const { readSuperAdminRoster } = await load('env@example.com')

    const roster = await readSuperAdminRoster()
    expect(roster.grantedAdmins).toEqual([])
    expect(roster.warning).toContain('could not be read')
  })

  it('sorts the env list', async () => {
    grants()
    const { readSuperAdminRoster } = await load('zoe@example.com,amy@example.com')

    expect((await readSuperAdminRoster()).envAdmins).toEqual([
      'amy@example.com',
      'zoe@example.com',
    ])
  })
})
