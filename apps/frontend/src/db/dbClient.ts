import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function createPostgresClient(
  username?: string,
  password?: string,
  endpoint?: string,
  port?: string,
  database?: string,
  ssl?: string,
) {
  if (!username || !password || !endpoint || !port || !database) {
    return postgres('postgres://postgres:postgres@localhost:5432/postgres', {
      max: 0,
    })
  }

  const connectionString = `postgres://${username}:${password}@${endpoint}:${port}/${database}`
  const useSsl =
    ssl === 'true' ||
    (ssl !== 'false' && endpoint !== 'localhost' && endpoint !== '127.0.0.1')
  return postgres(
    connectionString,
    useSsl ? { ssl: { rejectUnauthorized: false } } : {},
  )
}

export const client = createPostgresClient(
  process.env.POSTGRES_USERNAME,
  process.env.POSTGRES_PASSWORD,
  process.env.POSTGRES_ENDPOINT,
  process.env.POSTGRES_PORT,
  process.env.POSTGRES_DATABASE,
  process.env.POSTGRES_SSL,
)

const keycloakClient = createPostgresClient(
  process.env.KEYCLOAK_DB_USERNAME,
  process.env.KEYCLOAK_DB_PASSWORD,
  process.env.KEYCLOAK_DB_ENDPOINT,
  process.env.KEYCLOAK_DB_PORT,
  process.env.KEYCLOAK_DB_DATABASE,
  process.env.KEYCLOAK_DB_SSL,
)

export const db = drizzle(client, { schema: schema })
export const keycloakDB = drizzle(keycloakClient, { schema: schema })

export * from './schema'
