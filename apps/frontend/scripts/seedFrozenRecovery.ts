/**
 * Seed frozen-project fixtures for manual testing of frozen-project recovery.
 *
 * Creates four deterministic projects, all named with the prefix
 * `seed-frozen-recovery-`:
 *   - owned          frozen, private, owned by the --email address
 *   - public         frozen, public, owned by an example.test address
 *   - private        frozen, private, owned by an example.test address
 *   - active-control not frozen, public, owned by an example.test address.
 *                    Recovery must not touch it.
 *
 * Each fixture carries a `seed_fixture` marker with a nested value. Recovery
 * should leave that marker unchanged, which is how to check that it preserves
 * metadata. The marker also identifies fixtures this script created. A record
 * is treated as ours only if BOTH stores carry the marker, so the script never
 * overwrites a record it did not create.
 *
 * Writes go through `writeCourseMetadata`, the same dual-write helper the app
 * uses, so Postgres and Redis stay in sync.
 *
 * Usage (run from apps/frontend). The script loads apps/frontend/.env with
 * dotenv. Values already set in the environment take precedence over the file.
 *   npx tsx scripts/seedFrozenRecovery.ts --email you@example.edu
 *       Dry run (default). Checks endpoints and reads both stores. No writes.
 *   npx tsx scripts/seedFrozenRecovery.ts --email you@example.edu --apply
 *       Creates missing fixtures. Existing fixtures are left alone.
 *   npx tsx scripts/seedFrozenRecovery.ts --email you@example.edu --apply --reset
 *       Also sets is_frozen back to each fixture's declared value. Nothing else
 *       on the record changes.
 *
 * Required configuration: REDIS_URL, POSTGRES_ENDPOINT, POSTGRES_PORT,
 * POSTGRES_DATABASE, POSTGRES_USERNAME, POSTGRES_PASSWORD. Both endpoints must
 * be loopback (localhost, 127.0.0.1, or ::1). The script exits before importing
 * any store module or opening a connection if they are missing or not loopback.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import type { CourseMetadata } from '../src/types/courseMetadata'
import type * as CourseMetadataStore from '../src/utils/courseMetadataStore'
import type * as DbClient from '../src/db/dbClient'

const FIXTURE_PREFIX = 'seed-frozen-recovery-'
const EXAMPLE_OWNER = 'frozen-seed-owner@example.test'
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Stored on every fixture. Not a CourseMetadata field, so it is declared here. */
type SeedFixtureMarker = {
  id: string
  version: 1
  nested: { preserved: true; items: (string | number | null)[] }
}
type FixtureRecord = CourseMetadata & { seed_fixture: SeedFixtureMarker }

interface FixtureSpec {
  name: string
  /** True for the fixture owned by the --email address. */
  ownedByRequestedEmail: boolean
  isPrivate: boolean
  allowLoggedInUsers: boolean
  /** Declared state. `--reset` sets is_frozen back to this. */
  frozen: boolean
}

const FIXTURES: FixtureSpec[] = [
  {
    name: `${FIXTURE_PREFIX}owned`,
    ownedByRequestedEmail: true,
    isPrivate: true,
    allowLoggedInUsers: false,
    frozen: true,
  },
  {
    name: `${FIXTURE_PREFIX}public`,
    ownedByRequestedEmail: false,
    isPrivate: false,
    allowLoggedInUsers: false,
    frozen: true,
  },
  {
    name: `${FIXTURE_PREFIX}private`,
    ownedByRequestedEmail: false,
    isPrivate: true,
    allowLoggedInUsers: false,
    frozen: true,
  },
  {
    name: `${FIXTURE_PREFIX}active-control`,
    ownedByRequestedEmail: false,
    isPrivate: false,
    allowLoggedInUsers: false,
    frozen: false,
  },
]

interface Options {
  email: string
  apply: boolean
  reset: boolean
}

function parseArgs(argv: string[]): Options {
  let email: string | undefined
  let apply = false
  let reset = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') apply = true
    else if (arg === '--reset') reset = true
    else if (arg === '--email') {
      email = argv[i + 1]
      i++
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error('--email <address> is required and must be a valid address')
  }
  return { email, apply, reset }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is required. Set it in apps/frontend/.env or the environment. This script does not fall back to defaults.`,
    )
  }
  return value
}

/**
 * Runs before any store module is imported, so nothing connects to a
 * non-local target. Only hostnames are printed, never credentials.
 */
function assertLocalEndpoints(): void {
  const redisUrl = requireEnv('REDIS_URL')
  let redisHost: string
  try {
    redisHost = new URL(redisUrl).hostname
  } catch {
    throw new Error('REDIS_URL is not a valid URL')
  }
  if (!LOOPBACK_HOSTNAMES.has(redisHost)) {
    throw new Error(
      `REDIS_URL host "${redisHost}" is not loopback. Refusing to seed.`,
    )
  }

  const pgHost = requireEnv('POSTGRES_ENDPOINT')
  requireEnv('POSTGRES_PORT')
  requireEnv('POSTGRES_DATABASE')
  requireEnv('POSTGRES_USERNAME')
  requireEnv('POSTGRES_PASSWORD')
  if (!LOOPBACK_HOSTNAMES.has(pgHost)) {
    throw new Error(
      `POSTGRES_ENDPOINT "${pgHost}" is not loopback. Refusing to seed.`,
    )
  }
}

function buildFixture(
  spec: FixtureSpec,
  requestedEmail: string,
): FixtureRecord {
  return {
    is_private: spec.isPrivate,
    course_owner: spec.ownedByRequestedEmail ? requestedEmail : EXAMPLE_OWNER,
    course_admins: [],
    approved_emails_list: [],
    course_intro_message:
      'Seed fixture for frozen-project recovery. Local development only.',
    banner_image_s3: undefined,
    openai_api_key: '',
    example_questions: [],
    system_prompt: undefined,
    disabled_models: [],
    project_description: `Seed fixture ${spec.name}. Local development only.`,
    documentsOnly: false,
    guidedLearning: false,
    systemPromptOnly: false,
    vector_search_rewrite_disabled: false,
    allow_logged_in_users: spec.allowLoggedInUsers,
    is_frozen: spec.frozen,
    seed_fixture: {
      id: spec.name,
      version: 1,
      nested: { preserved: true, items: ['a', 1, null] },
    },
  }
}

/**
 * True when `record` carries this fixture's marker. Works for a parsed Redis
 * record and for a Postgres `raw_metadata` value, so both stores are checked
 * the same way.
 */
function carriesMarker(record: unknown, name: string): boolean {
  if (typeof record !== 'object' || record === null) return false
  const marker = (record as { seed_fixture?: { id?: unknown } | null })
    .seed_fixture
  return marker?.id === name
}

type Action = 'create' | 'reset' | 'skip' | 'unchanged' | 'collision'

interface PlannedFixture {
  name: string
  action: Action
  reason: string
  /** Set only for create and reset. Redis compare-and-set guards the write. */
  write: {
    metadata: CourseMetadata
    expectedPriorRedisValue: string | null
  } | null
}

interface Deps {
  readRaw: (name: string) => Promise<string | null>
  parse: (raw: string) => CourseMetadata | null
  writeCourseMetadata: typeof CourseMetadataStore.writeCourseMetadata
  db: typeof DbClient.db
  courseMetadata: typeof DbClient.courseMetadata
}

async function planFixture(
  spec: FixtureSpec,
  options: Options,
  deps: Deps,
): Promise<PlannedFixture> {
  const name = spec.name
  const desired = buildFixture(spec, options.email)
  const collision = (reason: string): PlannedFixture => ({
    name,
    action: 'collision',
    reason: `${reason} Not overwriting.`,
    write: null,
  })

  const redisRaw = await deps.readRaw(name)
  const [pgRow] = await deps.db
    .select({ raw: deps.courseMetadata.raw_metadata })
    .from(deps.courseMetadata)
    .where(eq(deps.courseMetadata.course_name, name))
    .limit(1)

  if (redisRaw === null) {
    if (pgRow) return collision('Postgres row exists but Redis has no record.')
    return {
      name,
      action: 'create',
      reason: 'missing in both stores',
      write: { metadata: desired, expectedPriorRedisValue: null },
    }
  }

  const redisRecord = deps.parse(redisRaw)
  if (!redisRecord || !carriesMarker(redisRecord, name)) {
    return collision('Redis record lacks this fixture marker.')
  }
  if (!pgRow)
    return collision('Redis has this fixture but Postgres has no row.')
  if (!carriesMarker(pgRow.raw, name)) {
    return collision('Postgres row lacks this fixture marker.')
  }

  if (!options.reset) {
    return {
      name,
      action: 'skip',
      reason: 'already exists; left as-is',
      write: null,
    }
  }
  if (redisRecord.is_frozen === spec.frozen) {
    return {
      name,
      action: 'unchanged',
      reason: `already in declared state (is_frozen=${spec.frozen})`,
      write: null,
    }
  }
  return {
    name,
    action: 'reset',
    reason: `set is_frozen=${spec.frozen}, all other fields kept`,
    // Only is_frozen changes. Other edits to the current record are kept.
    write: {
      metadata: { ...redisRecord, is_frozen: spec.frozen },
      expectedPriorRedisValue: redisRaw,
    },
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  assertLocalEndpoints()

  // Imported only after the endpoint checks pass.
  const store = await import('../src/utils/courseMetadataStore')
  const dbClient = await import('../src/db/dbClient')
  const { ensureRedisConnected } = await import('../src/utils/redisClient')

  const redis = await ensureRedisConnected()
  try {
    const deps: Deps = {
      readRaw: store.readCourseMetadataRaw,
      parse: store.parseStoredCourseMetadata,
      writeCourseMetadata: store.writeCourseMetadata,
      db: dbClient.db,
      courseMetadata: dbClient.courseMetadata,
    }

    // Every fixture is planned before the first write, so one collision
    // blocks the whole run.
    const plans: PlannedFixture[] = []
    for (const spec of FIXTURES) {
      plans.push(await planFixture(spec, options, deps))
    }
    for (const plan of plans) {
      console.log(`${plan.name}: ${plan.action} (${plan.reason})`)
    }

    const collisions = plans.filter((plan) => plan.action === 'collision')
    if (collisions.length > 0) {
      throw new Error(
        `${collisions.length} fixture(s) collide with existing data. No writes were made.`,
      )
    }
    if (!options.apply) {
      console.log('Dry run: no writes. Re-run with --apply to write.')
      return
    }

    for (const plan of plans) {
      if (!plan.write) continue
      await deps.writeCourseMetadata(plan.name, plan.write.metadata, {
        expectedPriorRedisValue: plan.write.expectedPriorRedisValue,
      })
    }
    console.log('Done.')
  } finally {
    // Only this script's own connections. Never stops a service.
    await dbClient.client.end({ timeout: 5 })
    if (redis.isOpen) await redis.quit()
  }
}

main().catch((err: unknown) => {
  console.error(
    'seedFrozenRecovery failed:',
    err instanceof Error ? err.message : err,
  )
  process.exitCode = 1
})
