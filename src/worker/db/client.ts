import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

import * as schema from './schema'

export type Database = DrizzleD1Database<typeof schema> & { $client: D1Database }

export function createDatabase(binding: D1Database): Database {
  return drizzle(binding, { schema })
}
