import { desc, eq } from 'drizzle-orm'

import { AUDIT_PAGE_SIZE } from '../../shared/constants'
import type { AuditStore } from '../audit'
import type { Database } from './client'
import { auditLog } from './schema'

/** D1-backed audit trail. Exercised by the Workers test project. */
export function createDrizzleAuditStore(db: Database): AuditStore {
  return {
    async append(entry) {
      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        organizationId: entry.organizationId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        ipHash: entry.ipHash ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: entry.metadata ?? null,
      })
    },
    async listForOrganization(organizationId) {
      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.organizationId, organizationId))
        .orderBy(desc(auditLog.createdAt))
        .limit(AUDIT_PAGE_SIZE)
      return rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        action: row.action,
        targetType: row.targetType,
        ...(row.organizationId !== null && { organizationId: row.organizationId }),
        ...(row.actorUserId !== null && { actorUserId: row.actorUserId }),
        ...(row.actorName !== null && { actorName: row.actorName }),
        ...(row.targetId !== null && { targetId: row.targetId }),
        ...(row.ipHash !== null && { ipHash: row.ipHash }),
        ...(row.userAgent !== null && { userAgent: row.userAgent }),
        ...(row.metadata !== null && { metadata: row.metadata }),
      }))
    },
  }
}
