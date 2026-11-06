import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  min,
  not,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { NextApiRequest } from 'next'
import { db, courseMetadata, projects } from '~/db/dbClient'
import type { CourseMetadata } from '~/types/courseMetadata'
import type { ChatbotProjectType } from '~/types/chatbotTags'
import type { SearchChatbotsResponse } from '~/components/UIUC-Components/chatbots-hub/chatbots.types'
import { toChatbotCardData } from '~/utils/chatbotCard'

export const SORT_BY_VALUES = ['created_at', 'name'] as const
export const SORT_DIR_VALUES = ['asc', 'desc'] as const
export type ChatbotsSortBy = (typeof SORT_BY_VALUES)[number]
export type ChatbotsSortDir = (typeof SORT_DIR_VALUES)[number]

export const DEFAULT_PAGE_LIMIT = 5
export const MAX_PAGE_LIMIT = 50

export type PageParams = {
  offset: number
  limit: number
  sortBy: ChatbotsSortBy
  sortDir: ChatbotsSortDir
}

export type GetChatbotsOptions = Partial<PageParams> & {
  userEmail: string
  /** owned = owner/admin; others = accessible to the user but not owned. */
  user: 'owned' | 'others'
  visibility?: 'public' | 'private'
  /** Match on the bot's first projectType tag. */
  type?: ChatbotProjectType
  /** Drop bots whose first projectType tag is one of these; untagged bots stay. */
  excludeTypes?: ChatbotProjectType[]
}
// Check the user is owner/admin of the bot
const ownedPredicate = (userEmail: string) =>
  or(
    eq(courseMetadata.course_owner, userEmail),
    arrayContains(courseMetadata.course_admins, [userEmail]),
  )!

/** SQL predicate for selecting Chatbots the user can access: public, logged-in-only, owned, admined, or approved. */
export function accessiblePredicate(userEmail: string): SQL {
  return or(
    eq(courseMetadata.is_private, false),
    eq(courseMetadata.allow_logged_in_users, true),
    ownedPredicate(userEmail),
    arrayContains(courseMetadata.approved_emails_list, [userEmail]),
  )!
}

// Mirrors `.find()` in toChatbotCardData: deterministic decider of chatbot type
const firstProjectType = sql`(
  SELECT t.tag->>'value'
  FROM jsonb_array_elements(${courseMetadata.tags}) WITH ORDINALITY AS t(tag, ord)
  WHERE t.tag->>'category' = 'projectType'
  ORDER BY t.ord
  LIMIT 1
)`

// course_metadata has no creation date; projects.created_at is the source of truth.
const createdAt = () =>
  sql`${db
    .select({ created_at: min(projects.created_at) })
    .from(projects)
    .where(eq(projects.course_name, courseMetadata.course_name))}`

function buildWhere(opts: GetChatbotsOptions): SQL {
  const { userEmail } = opts
  const owned = ownedPredicate(userEmail)

  return and(
    eq(courseMetadata.is_frozen, false), // exclude frozen bots
    opts.user === 'owned'  // filter by ownership (bots you own vs member) if requested
      ? owned
      : and(accessiblePredicate(userEmail), not(owned)),
    opts.visibility &&  // filter by visibility if requested
      eq(courseMetadata.is_private, opts.visibility === 'private'),
    opts.type && eq(firstProjectType, opts.type), // filter by chatbot type
    opts.excludeTypes?.length // filter out specific chatbot types if requested
      ? // COALESCE keeps untagged bots, whose type is NULL.
        notInArray(sql`COALESCE(${firstProjectType}, '')`, opts.excludeTypes)
      : undefined,
  )!
}

// Sort by the requested field, with a tiebreaker on course_name to keep pages deterministic.
function buildOrderBy(sortBy: ChatbotsSortBy, sortDir: ChatbotsSortDir): SQL[] {
  const dir = sortDir === 'asc' ? asc : desc
  const primary =
    sortBy === 'name'
      ? dir(sql`LOWER(${courseMetadata.course_name})`)
      : // asc()/desc() can't add NULLS LAST.
        sql`${dir(createdAt())} NULLS LAST`
  // Tiebreaker keeps pages deterministic.
  return [primary, asc(courseMetadata.course_name)]
}

// Returns a page of chatbots matching the given options, with total count.
export async function getChatbots(
  opts: GetChatbotsOptions,
): Promise<SearchChatbotsResponse> {
  const {
    offset = 0,
    limit = DEFAULT_PAGE_LIMIT,
    sortBy = 'created_at',
    sortDir = 'desc',
  } = opts
  const where = buildWhere(opts)

  const rows = await db
    .select({
      course_name: courseMetadata.course_name,
      raw_metadata: courseMetadata.raw_metadata,
      created_at: createdAt().mapWith(projects.created_at),
      // Raw: drizzle has no window-function builder.
      total: sql`count(*) OVER()`.mapWith(Number),
    })
    .from(courseMetadata)
    .where(where)
    .orderBy(...buildOrderBy(sortBy, sortDir))
    .limit(limit)
    .offset(offset)

  let total = rows[0]?.total ?? 0
  if (rows.length === 0 && offset > 0) {
    // Past the last page: the window count is unavailable, so count directly.
    const [row] = await db
      .select({ n: count() })
      .from(courseMetadata)
      .where(where)
    total = row?.n ?? 0
  }

  const results = rows.map((row) => ({
    ...toChatbotCardData(
      row.course_name,
      row.raw_metadata as CourseMetadata,
      opts.userEmail,
    ),
    created_at: row.created_at?.toISOString(),
  }))

  return { results, total }
}

function pickEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T | null {
  if (raw === undefined) return fallback
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : null
}

function pickInt(raw: unknown, fallback: number, min: number, max: number) {
  if (raw === undefined) return fallback
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= min && n <= max ? n : null
}

/** Parse the only request-controlled options; everything else is fixed per endpoint. */
export function parsePageParams(
  query: NextApiRequest['query'],
): { params: PageParams } | { error: string } {
  const offset = pickInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER)
  if (offset === null) return { error: 'Invalid offset' }
  const limit = pickInt(query.limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT)
  if (limit === null) return { error: `limit must be 1–${MAX_PAGE_LIMIT}` }
  const sortBy = pickEnum(query.sortBy, SORT_BY_VALUES, 'created_at')
  if (sortBy === null) return { error: 'Invalid sortBy' }
  const sortDir = pickEnum(query.sortDir, SORT_DIR_VALUES, 'desc')
  if (sortDir === null) return { error: 'Invalid sortDir' }
  return { params: { offset, limit, sortBy, sortDir } }
}
