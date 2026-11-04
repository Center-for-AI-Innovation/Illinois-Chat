import { type Conversation } from '@/types/chat'

const DAY = 24 * 60 * 60 * 1000

const BUCKETS = [
  { label: 'Today', maxDays: 0 },
  { label: 'Yesterday', maxDays: 1 },
  { label: 'Previous 7 days', maxDays: 7 },
  { label: 'Previous 30 days', maxDays: 30 },
] as const

function daysAgo(value: string | undefined, today: number) {
  const time = value ? new Date(value).getTime() : Number.NaN
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY
  const day = new Date(time)
  day.setHours(0, 0, 0, 0)
  return Math.round((today - day.getTime()) / DAY)
}

/** Groups conversations by last activity, keeping their existing order. */
export function groupByDate(conversations: Conversation[], now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const groups = new Map<string, Conversation[]>()
  for (const conversation of conversations) {
    const age = daysAgo(
      conversation.updatedAt ?? conversation.createdAt,
      start.getTime(),
    )
    const label =
      BUCKETS.find((bucket) => age <= bucket.maxDays)?.label ?? 'Older'
    groups.set(label, [...(groups.get(label) ?? []), conversation])
  }
  return [...groups].map(([label, items]) => ({ label, items }))
}
