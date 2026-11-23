/* @vitest-environment node */

// Storage-level guarantees for patchConnectionField. The route-level tests
// cover the merge semantics; these cover the two properties only this layer
// can provide: the row is locked for the duration, and `is_active` is not part
// of the update at all.

import { beforeEach, describe, expect, it, vi } from 'vitest'

interface QueryLog {
  forUpdateCalled: boolean
  updatePayload: Record<string, unknown> | null
  transactionUsed: boolean
}

const log: QueryLog = {
  forUpdateCalled: false,
  updatePayload: null,
  transactionUsed: false,
}

let selectedRow: Record<string, unknown> | undefined

vi.mock('~/db/dbClient', () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: (mode: string) => {
              log.forUpdateCalled = mode === 'update'
              return Promise.resolve(selectedRow ? [selectedRow] : [])
            },
          }),
        }),
      }),
    }),
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        log.updatePayload = payload
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([{ ...selectedRow, ...payload }]),
          }),
        }
      },
    }),
  }

  return {
    db: {
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
        log.transactionUsed = true
        return fn(tx)
      },
    },
  }
})

beforeEach(() => {
  log.forUpdateCalled = false
  log.updatePayload = null
  log.transactionUsed = false
  selectedRow = undefined
})

describe('patchConnectionField', () => {
  it('reads the row under a FOR UPDATE lock inside one transaction', async () => {
    selectedRow = {
      project_name: 'demo',
      is_active: false,
      qdrant_config: { encrypted: 'v1.stored' },
    }

    const { patchConnectionField } = await import('~/db/projectConnectionsRepo')
    const result = await patchConnectionField({
      projectName: 'demo',
      kind: 'qdrant',
      merge: async (current) => {
        // The callback is handed the value read under the lock, which is what
        // makes a concurrent rotation impossible to clobber.
        expect(current).toEqual({ encrypted: 'v1.stored' })
        return { encrypted: 'v1.merged' }
      },
    })

    expect(log.transactionUsed).toBe(true)
    expect(log.forUpdateCalled).toBe(true)
    expect(result.status).toBe('ok')
  })

  it('never writes is_active', async () => {
    selectedRow = {
      project_name: 'demo',
      is_active: false,
      s3_config: { encrypted: 'v1.stored' },
    }

    const { patchConnectionField } = await import('~/db/projectConnectionsRepo')
    await patchConnectionField({
      projectName: 'demo',
      kind: 's3',
      merge: async () => ({ encrypted: 'v1.merged' }),
    })

    expect(log.updatePayload).not.toBeNull()
    expect(Object.keys(log.updatePayload ?? {})).toEqual([
      's3_config',
      'updated_at',
    ])
    expect(log.updatePayload).not.toHaveProperty('is_active')
  })

  it('reports a missing row without calling merge', async () => {
    selectedRow = undefined
    const merge = vi.fn()

    const { patchConnectionField } = await import('~/db/projectConnectionsRepo')
    const result = await patchConnectionField({
      projectName: 'ghost',
      kind: 's3',
      merge,
    })

    expect(result).toEqual({ status: 'row_not_found' })
    expect(merge).not.toHaveBeenCalled()
    expect(log.updatePayload).toBeNull()
  })

  it('reports an unconfigured kind without calling merge', async () => {
    selectedRow = {
      project_name: 'demo',
      is_active: true,
      s3_config: null,
    }
    const merge = vi.fn()

    const { patchConnectionField } = await import('~/db/projectConnectionsRepo')
    const result = await patchConnectionField({
      projectName: 'demo',
      kind: 's3',
      merge,
    })

    expect(result).toEqual({ status: 'kind_not_configured' })
    expect(merge).not.toHaveBeenCalled()
  })
})
