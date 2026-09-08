import { desc, lt } from 'drizzle-orm'

import {
  CLIENT_ERROR_PAGE_SIZE,
  HEALTH_CHECK_PAGE_SIZE,
  OBSERVABILITY_RETENTION_MS,
} from '../../shared/constants'
import type { ClientErrorRecord, HealthCheckRecord, ObservabilityStore } from '../stores'
import type { Database } from './client'
import { clientError, healthCheck } from './schema'

/** Cutoff for pruning: rows created before this are removed on the next insert. */
function retentionCutoff(): Date {
  return new Date(Date.now() - OBSERVABILITY_RETENTION_MS)
}

/** D1-backed client-error and health-check store. Exercised by the Workers test project. */
export function createDrizzleObservabilityStore(db: Database): ObservabilityStore {
  return {
    async recordClientError(input) {
      await db.delete(clientError).where(lt(clientError.createdAt, retentionCutoff()))
      await db.insert(clientError).values({ id: crypto.randomUUID(), ...input })
    },
    async listClientErrors() {
      const rows = await db
        .select()
        .from(clientError)
        .orderBy(desc(clientError.createdAt))
        .limit(CLIENT_ERROR_PAGE_SIZE)
      return rows.map((row) => toClientError(row))
    },
    async recordHealthCheck(input) {
      await db.delete(healthCheck).where(lt(healthCheck.createdAt, retentionCutoff()))
      await db.insert(healthCheck).values({ id: crypto.randomUUID(), ...input })
    },
    async listHealthChecks() {
      const rows = await db
        .select()
        .from(healthCheck)
        .orderBy(desc(healthCheck.createdAt))
        .limit(HEALTH_CHECK_PAGE_SIZE)
      return rows.map((row) => toHealthCheck(row))
    },
  }
}

function toClientError(row: typeof clientError.$inferSelect): ClientErrorRecord {
  return {
    id: row.id,
    message: row.message,
    source: row.source,
    route: row.route,
    userAgent: row.userAgent,
    requestId: row.requestId,
    userId: row.userId,
    createdAt: row.createdAt,
  }
}

function toHealthCheck(row: typeof healthCheck.$inferSelect): HealthCheckRecord {
  return {
    id: row.id,
    ok: row.ok,
    detail: row.detail,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  }
}
