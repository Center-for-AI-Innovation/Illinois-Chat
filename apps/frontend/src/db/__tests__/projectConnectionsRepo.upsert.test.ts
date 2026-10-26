/* @vitest-environment node */

// upsertConnectionField inserts a new row as active, but an update of an
// existing row must not write is_active. Adding a kind to a disabled project
// would otherwise turn S3, DB, and Qdrant back on for live traffic.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const captured: {
  insertValues: Record<string, unknown> | null
  updateSet: Record<string, unknown> | null
} = {
  insertValues: null,
  updateSet: null,
}

vi.mock('~/db/dbClient', () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        captured.insertValues = values
        return {
          onConflictDoUpdate: (args: { set: Record<string, unknown> }) => {
            captured.updateSet = args.set
            return {
              returning: () =>
                Promise.resolve([
                  {
                    project_name: 'demo',
                    ...values,
                    // The stored row was already disabled. The update must
                    // not be what flips it back on.
                    is_active: false,
                  },
                ]),
            }
          },
        }
      },
    }),
  },
}))

beforeEach(() => {
  captured.insertValues = null
  captured.updateSet = null
})

describe('upsertConnectionField', () => {
  it('upsert of a new kind on a disabled row stays disabled', async () => {
    const { upsertConnectionField } =
      await import('~/db/projectConnectionsRepo')
    const row = await upsertConnectionField({
      projectName: 'demo',
      projectId: 1,
      kind: 'embedding',
      encryptedBlob: { encrypted: 'v1.blob' },
    })

    expect(captured.insertValues?.is_active).toBe(true)
    expect(captured.insertValues?.embedding_config).toEqual({
      encrypted: 'v1.blob',
    })
    expect(captured.updateSet).not.toHaveProperty('is_active')
    expect(captured.updateSet).toMatchObject({
      embedding_config: { encrypted: 'v1.blob' },
    })
    expect(row.is_active).toBe(false)
  })
})
