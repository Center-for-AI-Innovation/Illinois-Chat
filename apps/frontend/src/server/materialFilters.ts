import { sql, type SQL } from 'drizzle-orm'
import { type PgColumn } from 'drizzle-orm/pg-core'

/** Columns the project files table exposes: file name, URL, starting URL. */
export const MATERIAL_FILTER_COLUMNS = [
  'readable_filename',
  'url',
  'base_url',
] as const

export class FilterValidationError extends Error {}

/**
 * Parses the `filters` query parameter (a JSON object of column -> text) into
 * ILIKE conditions combined with AND. Empty values are ignored. Throws
 * FilterValidationError for malformed JSON or columns outside the allowlist.
 */
export function buildMaterialFilterConditions(
  rawFilters: string | string[] | undefined | null,
  columns: Record<(typeof MATERIAL_FILTER_COLUMNS)[number], PgColumn>,
): SQL[] {
  if (rawFilters === undefined || rawFilters === null || rawFilters === '') {
    return []
  }
  if (typeof rawFilters !== 'string') {
    throw new FilterValidationError('filters must be a single JSON object')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawFilters)
  } catch {
    throw new FilterValidationError('filters must be valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FilterValidationError('filters must be a JSON object')
  }
  const conditions: SQL[] = []
  for (const [key, value] of Object.entries(parsed)) {
    if (!(MATERIAL_FILTER_COLUMNS as readonly string[]).includes(key)) {
      throw new FilterValidationError(`Unsupported filter column: ${key}`)
    }
    if (typeof value !== 'string') {
      throw new FilterValidationError(`Filter value for ${key} must be a string`)
    }
    if (value === '') continue
    const column = columns[key as (typeof MATERIAL_FILTER_COLUMNS)[number]]
    conditions.push(sql`${column} ILIKE ${`%${value}%`}`)
  }
  return conditions
}

