import { and, eq, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'

import {
  MAX_LOGOS_PER_ORGANIZATION,
  MAX_PHOTOS_PER_ORGANIZATION,
  MAX_STORAGE_BYTES_PER_ORGANIZATION,
} from '../../shared/constants'
import type { AuditEntry } from '../audit'
import type { StorageUsage } from '../stores'
import { UPLOAD_POLICY, type UploadReservation, type UploadStore } from '../upload-store'
import type { Database } from './client'
import { asset, organization, photo, uploadReservation } from './schema'

function ticket(row: typeof uploadReservation.$inferSelect): UploadReservation {
  if (row.kind !== 'photo' && row.kind !== 'logo')
    throw new TypeError('Invalid upload reservation kind')
  if (row.keys.some((key) => !key.startsWith(`org/${row.organizationId}/`)))
    throw new TypeError('Upload cleanup key does not belong to its workspace')
  return { ...row, kind: row.kind }
}

function usageBytes(organizationId: string): SQL {
  return sql`
    (SELECT COALESCE(SUM(size + thumbnail_size), 0) FROM photo WHERE organization_id = ${organizationId})
        + (SELECT COALESCE(SUM(size), 0) FROM asset WHERE organization_id = ${organizationId})
        + (SELECT COALESCE(SUM(bytes), 0) FROM upload_reservation WHERE organization_id = ${organizationId} AND status IN ('pending', 'cleanup'))
  `
}

function auditInsert(entry: AuditEntry, condition: SQL): SQL {
  return sql`
    INSERT INTO audit_log (id, organization_id, actor_user_id, actor_name, action, target_type, target_id, metadata, created_at)
        SELECT ${crypto.randomUUID()}, ${entry.organizationId ?? null}, ${entry.actorUserId ?? null}, ${entry.actorName ?? null}, ${entry.action}, ${entry.targetType}, ${entry.targetId ?? null}, ${entry.metadata === undefined ? null : JSON.stringify(entry.metadata)}, ${Date.now()}
        WHERE ${condition}
  `
}

function deletionReceipt(
  organizationId: string,
  id: string,
  kind: 'photo' | 'logo',
  actor: string,
  exists: SQL,
): SQL {
  return sql`
    INSERT INTO upload_reservation (id, organization_id, upload_id, kind, user_id, fingerprint, keys, bytes, status, expires_at)
        SELECT ${crypto.randomUUID()}, ${organizationId}, ${id}, ${kind}, ${actor}, 'deletion', '[]', 0, 'deleted', 0
        WHERE ${exists} AND NOT EXISTS (SELECT 1 FROM upload_reservation WHERE organization_id = ${organizationId} AND kind = ${kind} AND upload_id = ${id} AND status IN ('committed', 'deleted'))
  `
}

/** D1 serializes quota admission and commits metadata/audit/reservation release as a batch. */
export function createDrizzleUploadStore(db: Database): UploadStore {
  const dialect = new SQLiteSyncDialect()
  async function batch(statements: SQL[]) {
    const prepared = statements.map((statement) => {
      const query = dialect.sqlToQuery(statement)
      return db.$client.prepare(query.sql).bind(...query.params)
    })
    return await db.$client.batch(prepared)
  }
  async function currentUsage(organizationId: string): Promise<StorageUsage> {
    const [row] = await db.all<{ count: number; bytes: number }>(sql`
      SELECT
            (SELECT COUNT(*) FROM photo WHERE organization_id = ${organizationId}) AS count,
            ${usageBytes(organizationId)} AS bytes
    `)
    if (row === undefined) throw new Error('Storage usage query returned no result')
    return row
  }
  async function pendingFor(input: UploadReservation) {
    const [pending] = await db
      .select()
      .from(uploadReservation)
      .where(
        and(
          eq(uploadReservation.organizationId, input.organizationId),
          eq(uploadReservation.kind, input.kind),
          eq(uploadReservation.uploadId, input.uploadId),
          eq(uploadReservation.status, 'pending'),
        ),
      )
    return pending
  }
  return {
    async hasContent(organizationId) {
      const [row] = await db.all<{
        hasContent: number
      }>(sql`
        SELECT EXISTS (SELECT 1 FROM photo WHERE organization_id = ${organizationId})
                OR EXISTS (SELECT 1 FROM asset WHERE organization_id = ${organizationId})
                OR EXISTS (SELECT 1 FROM watermark WHERE organization_id = ${organizationId})
                OR EXISTS (SELECT 1 FROM upload_reservation WHERE organization_id = ${organizationId} AND status IN ('pending', 'cleanup')) AS hasContent
      `)
      if (row === undefined) throw new Error('Workspace content query returned no result')
      return row.hasContent !== 0
    },
    async reserve(input) {
      const records = input.kind === 'photo' ? photo : asset
      const maxCount =
        input.kind === 'photo' ? MAX_PHOTOS_PER_ORGANIZATION : MAX_LOGOS_PER_ORGANIZATION
      const rows = await db.all<{
        id: string
      }>(sql`
        INSERT INTO upload_reservation (id, organization_id, upload_id, kind, user_id, fingerprint, keys, bytes, status, expires_at)
                SELECT ${input.id}, ${input.organizationId}, ${input.uploadId}, ${input.kind}, ${input.userId}, ${input.fingerprint}, ${JSON.stringify(input.keys)}, ${input.bytes}, 'pending', ${input.expiresAt.getTime()}
                WHERE NOT EXISTS (SELECT 1 FROM ${records} WHERE organization_id = ${input.organizationId} AND id = ${input.uploadId})
                AND NOT EXISTS (SELECT 1 FROM upload_reservation WHERE organization_id = ${input.organizationId} AND kind = ${input.kind} AND upload_id = ${input.uploadId} AND status IN ('committed', 'deleted'))
                AND (SELECT COUNT(*) FROM ${records} WHERE organization_id = ${input.organizationId})
                  + (SELECT COUNT(*) FROM upload_reservation WHERE organization_id = ${input.organizationId} AND kind = ${input.kind} AND status IN ('pending', 'cleanup')) < ${maxCount}
                AND ${usageBytes(input.organizationId)} + ${input.bytes} <= ${MAX_STORAGE_BYTES_PER_ORGANIZATION}
                ON CONFLICT DO NOTHING RETURNING id
      `)
      if (rows.length > 0) return 'reserved'
      const pending = await pendingFor(input)
      if (pending !== undefined)
        return pending.userId === input.userId && pending.fingerprint === input.fingerprint
          ? 'pending'
          : 'conflict'
      const existing = await db.all<{ id: string }>(
        sql`SELECT id FROM ${records} WHERE organization_id = ${input.organizationId} AND id = ${input.uploadId}`,
      )
      if (existing.length > 0) return 'existing'
      const receipt = await db.all<{ id: string }>(
        sql`SELECT id FROM upload_reservation WHERE organization_id = ${input.organizationId} AND kind = ${input.kind} AND upload_id = ${input.uploadId} AND status IN ('committed', 'deleted')`,
      )
      return receipt.length > 0 ? 'deleted' : 'quota'
    },
    async commit(input, record, audit) {
      const ready = sql`EXISTS (SELECT 1 FROM upload_reservation WHERE id = ${input.id} AND organization_id = ${input.organizationId} AND status = 'pending' AND expires_at > ${Date.now()})`
      const value = record.value
      if (
        value.id !== input.uploadId ||
        value.organizationId !== input.organizationId ||
        value.createdBy !== input.userId ||
        value.key !== input.keys[0] ||
        record.kind !== input.kind
      )
        throw new Error('Upload commit does not match its reservation')
      let insert: SQL
      const { kind, value: item } = record
      if (kind === 'photo') {
        if (item.thumbnailKey !== input.keys[1])
          throw new Error('Thumbnail does not match its reservation')
        insert = sql`
          INSERT INTO photo (id, organization_id, name, key, thumbnail_key, thumbnail_size, content_type, size, width, height, preset_id, preset_name, created_by, created_at)
                    SELECT ${item.id}, ${item.organizationId}, ${item.name}, ${item.key}, ${item.thumbnailKey}, ${item.thumbnailSize ?? 0}, ${item.contentType}, ${item.size}, ${item.width}, ${item.height}, ${item.presetId}, ${item.presetName}, ${item.createdBy}, ${Date.now()} WHERE ${ready} RETURNING id
        `
      } else {
        insert = sql`
          INSERT INTO asset (id, organization_id, kind, name, key, content_type, size, width, height, created_by, created_at)
                    SELECT ${item.id}, ${item.organizationId}, ${item.kind}, ${item.name}, ${item.key}, ${item.contentType}, ${item.size}, ${item.width}, ${item.height}, ${item.createdBy}, ${Date.now()} WHERE ${ready} RETURNING id
        `
      }
      const [created] = await batch([
        insert,
        auditInsert(audit, ready),
        sql`UPDATE upload_reservation SET status = 'committed' WHERE id = ${input.id} AND ${ready}`,
      ])
      if (created === undefined) throw new Error('Upload commit returned no result')
      return created.results.length > 0
    },
    async abandon(id) {
      await db
        .update(uploadReservation)
        .set({ status: 'cleanup' })
        .where(and(eq(uploadReservation.id, id), eq(uploadReservation.status, 'pending')))
    },
    async cleanupCandidates(organizationId) {
      const now = new Date()
      const scope =
        organizationId === undefined
          ? undefined
          : eq(uploadReservation.organizationId, organizationId)
      await db
        .update(uploadReservation)
        .set({ status: 'cleanup' })
        .where(
          and(
            scope,
            eq(uploadReservation.status, 'pending'),
            lte(uploadReservation.expiresAt, now),
          ),
        )
      const rows = await db
        .select()
        .from(uploadReservation)
        .where(and(scope, eq(uploadReservation.status, 'cleanup')))
        .limit(UPLOAD_POLICY.cleanupBatch)
      return rows.map((row) => ticket(row))
    },
    async release(id) {
      await db
        .delete(uploadReservation)
        .where(and(eq(uploadReservation.id, id), eq(uploadReservation.status, 'cleanup')))
    },
    async deletePhotos(organizationId, ids, audit) {
      const selected = and(eq(photo.organizationId, organizationId), inArray(photo.id, [...ids]))
      const rows = await db.select().from(photo).where(selected)
      if (rows.length === 0) return 0
      const statements = rows.map(
        (row) => sql`
          INSERT INTO upload_reservation (id, organization_id, upload_id, kind, user_id, fingerprint, keys, bytes, status, expires_at)
                  SELECT ${crypto.randomUUID()}, ${organizationId}, ${row.id}, 'photo', ${audit.actorUserId ?? ''}, 'deletion', ${JSON.stringify([row.key, row.thumbnailKey])}, ${row.size + row.thumbnailSize}, 'cleanup', ${Date.now()}
                  WHERE EXISTS (SELECT 1 FROM photo WHERE organization_id = ${organizationId} AND id = ${row.id})
        `,
      )
      const result = await batch([
        ...statements,
        sql`UPDATE upload_reservation SET status = 'deleted' WHERE organization_id = ${organizationId} AND kind = 'photo' AND status = 'committed' AND upload_id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`,`,
        )})`,
        ...rows.map((row) =>
          deletionReceipt(
            organizationId,
            row.id,
            'photo',
            audit.actorUserId ?? '',
            sql`EXISTS (SELECT 1 FROM photo WHERE organization_id = ${organizationId} AND id = ${row.id})`,
          ),
        ),
        auditInsert(audit, sql`EXISTS (SELECT 1 FROM photo WHERE ${selected})`),
        db.delete(photo).where(selected).returning({ id: photo.id }).getSQL(),
      ])
      const deleted = result.at(-1)
      if (deleted === undefined) throw new Error('Photo deletion returned no row count')
      return deleted.results.length
    },
    async deleteLogo(organizationId, id, audit) {
      const selected = and(
        eq(asset.organizationId, organizationId),
        eq(asset.id, id),
        sql`NOT EXISTS (SELECT 1 FROM watermark WHERE organization_id = ${organizationId} AND json_extract(spec, '$.kind') = 'image' AND json_extract(spec, '$.assetId') = ${id})`,
      )
      const [row] = await db.select().from(asset).where(selected)
      if (row === undefined) return false
      const exists = sql`EXISTS (SELECT 1 FROM asset WHERE ${selected})`
      const result = await batch([
        sql`
          INSERT INTO upload_reservation (id, organization_id, upload_id, kind, user_id, fingerprint, keys, bytes, status, expires_at)
                    SELECT ${crypto.randomUUID()}, ${organizationId}, ${id}, 'logo', ${audit.actorUserId ?? ''}, 'deletion', ${JSON.stringify([row.key])}, ${row.size}, 'cleanup', ${Date.now()} WHERE ${exists}
        `,
        auditInsert(audit, exists),
        sql`UPDATE upload_reservation SET status = 'deleted' WHERE organization_id = ${organizationId} AND kind = 'logo' AND upload_id = ${id} AND status = 'committed' AND ${exists}`,
        deletionReceipt(organizationId, id, 'logo', audit.actorUserId ?? '', exists),
        db.delete(asset).where(selected).returning({ id: asset.id }).getSQL(),
      ])
      const deleted = result.at(-1)
      if (deleted === undefined) throw new Error('Logo deletion returned no result')
      return deleted.results.length > 0
    },
    usage: currentUsage,
    async usageByOrganization() {
      const organizations = await db.select({ id: organization.id }).from(organization)
      const results = await Promise.all(
        organizations.map(async (row) => [row.id, await currentUsage(row.id)] as const),
      )
      return new Map(results)
    },
  }
}
