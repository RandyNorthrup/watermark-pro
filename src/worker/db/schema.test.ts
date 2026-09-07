/**
 * Drift guard: Better Auth derives the tables it needs from the runtime
 * options (core models plus every enabled plugin). This test compares that
 * derivation with the drizzle schema, so a Better Auth upgrade that adds or
 * requires a column fails here instead of at the first production request.
 */
import { getAuthTables } from '@better-auth/core/db'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import * as schema from './schema'
import { buildAuthOptions } from '../auth/options'
import { unlimitedRateLimitStorage } from '../auth/rate-limit'
import { createConsoleEmailSender } from '../email/console'
import { createMemoryAuditStore } from '../test-support/memory-audit-store'
import { TEST_SECRET } from '../test-support/test-app'

const options = buildAuthOptions({
  database: memoryAdapter({}),
  secret: TEST_SECRET,
  appUrl: 'http://localhost:5273',
  email: createConsoleEmailSender(),
  audit: createMemoryAuditStore(),
  rateLimit: unlimitedRateLimitStorage,
  rateLimitEnabled: false,
})

const byName = (left: string, right: string) => left.localeCompare(right)

const drizzleTables: Record<string, Record<string, { notNull: boolean }>> = {
  user: getTableColumns(schema.user),
  session: getTableColumns(schema.session),
  account: getTableColumns(schema.account),
  verification: getTableColumns(schema.verification),
  organization: getTableColumns(schema.organization),
  member: getTableColumns(schema.member),
  invitation: getTableColumns(schema.invitation),
}

describe('drizzle schema matches Better Auth expectations', () => {
  const authTables = getAuthTables(options)
  // Rate limiting uses the Workers binding, not a table.
  const models = Object.entries(authTables).filter(([model]) => model !== 'rateLimit')

  it('covers every model Better Auth will query', () => {
    expect(models.map(([model]) => model).toSorted(byName)).toEqual(
      Object.keys(drizzleTables).toSorted(byName),
    )
  })

  it.each(models)('has every field of the %s model with matching nullability', (_model, table) => {
    const columns = drizzleTables[table.modelName]
    expect(columns).toBeDefined()
    for (const [field, attributes] of Object.entries(table.fields)) {
      expect(columns, `${table.modelName}.${field} is missing`).toHaveProperty(field)
      const column = columns?.[field]
      const isRequired = attributes.required ?? false
      expect(column?.notNull, `${table.modelName}.${field} nullability`).toBe(isRequired)
    }
  })
})
