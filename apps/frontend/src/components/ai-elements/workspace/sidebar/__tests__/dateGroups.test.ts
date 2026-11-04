import { describe, expect, it } from 'vitest'
import { type Conversation } from '@/types/chat'
import { groupByDate } from '../dateGroups'

const at = (id: string, updatedAt?: string) =>
  ({ id, name: id, messages: [], updatedAt }) as unknown as Conversation

describe('groupByDate', () => {
  it('buckets conversations by last activity in their original order', () => {
    const now = new Date('2026-11-03T15:00:00')
    const groups = groupByDate(
      [
        at('a', '2026-11-03T09:00:00'),
        at('b', '2026-11-02T22:00:00'),
        at('c', '2026-10-30T12:00:00'),
        at('d', '2026-10-10T12:00:00'),
        at('e', '2025-01-01T12:00:00'),
        at('f'),
      ],
      now,
    )
    expect(groups.map((g) => [g.label, g.items.map((c) => c.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Previous 7 days', ['c']],
      ['Previous 30 days', ['d']],
      ['Older', ['e', 'f']],
    ])
  })
})
