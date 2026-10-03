import { and, eq, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'

import type { AuditEntry } from '../audit'
import type { StorageUsage } from '../stores'
import { UPLOAD_POLICY, type UploadReservation, type UploadStore } from '../upload-store'
import type { Database } from './client'
import { folderDestination, workspaceWriter } from './folder-guards'
import { apiErrors } from '../errors'
import { workspaceCapacitySql } from './plan-capacity'
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

function uploadCount(organizationId: string, kind: 'photo' | 'logo'): SQL {
  const records = kind === 'photo' ? photo : asset
  return sql`
    (SELECT COUNT(*) FROM ${records} WHERE organization_id = ${organizationId})
        + (SELECT COUNT(*) FROM upload_reservation WHERE organization_id = ${organizationId}
          AND kind = ${kind} AND status IN ('pending', 'cleanup'))
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

function finalizeRetiredPersonal(organizationId: string): SQL {
  return sql`
    DELETE FROM organization WHERE id = ${organizationId}
          AND creation_kind = 'personal' AND creation_owner_id IS NULL
          AND EXISTS (SELECT 1 FROM workspace_plan WHERE organization_id = ${organizationId} AND kind = 'personal')
        AND NOT EXISTS (SELECT 1 FROM private_workspace WHERE organization_id = ${organizationId})
        AND NOT EXISTS (SELECT 1 FROM member WHERE organization_id = ${organizationId})
        AND NOT EXISTS (SELECT 1 FROM photo WHERE organization_id = ${organizationId})
        AND NOT EXISTS (SELECT 1 FROM asset WHERE organization_id = ${organizationId})
        AND NOT EXISTS (SELECT 1 FROM watermark WHERE organization_id = ${organizationId})
        AND NOT EXISTS (SELECT 1 FROM upload_reservation WHERE organization_id = ${organizationId} AND status IN ('pending', 'cleanup'))
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
    async stagePersonalDeletion(userId) {
      const [scope] = await db.all<{
        id: string
        creationKind: string
        creator: string | null
        kind: string | null
        isOwner: number
        members: number
        otherOwner: number
        banned: number
      }>(sql`
        SELECT o.id, o.creation_kind AS creationKind, o.creation_owner_id AS creator, p.kind,
          EXISTS (SELECT 1 FROM member WHERE organization_id=o.id AND user_id=${userId} AND role='owner') AS isOwner,
          (SELECT COUNT(*) FROM member WHERE organization_id=o.id) AS members,
          EXISTS (SELECT 1 FROM member WHERE organization_id=o.id AND user_id<>${userId} AND role='owner') AS otherOwner,
          coalesce(u.banned,0) AS banned FROM private_workspace w
        JOIN organization o ON o.id=w.organization_id JOIN user u ON u.id=w.user_id
        LEFT JOIN workspace_plan p ON p.organization_id=o.id WHERE w.user_id=${userId}
      `)
      if (scope?.creationKind !== 'personal' || scope.members > 1 || scope.otherOwner === 1) return
      if (
        scope.kind !== 'personal' ||
        scope.isOwner !== 1 ||
        scope.members !== 1 ||
        scope.banned !== 1 ||
        (scope.creator !== null && scope.creator !== userId)
      )
        throw apiErrors.forbidden()
      const id = scope.id,
        now = Date.now()
      const eligible = sql`
        EXISTS (SELECT 1 FROM private_workspace w JOIN organization o ON o.id=w.organization_id
                JOIN workspace_plan p ON p.organization_id=o.id JOIN user u ON u.id=w.user_id
                WHERE w.user_id=${userId} AND o.id=${id} AND o.creation_kind='personal' AND p.kind='personal'
                  AND (o.creation_owner_id=${userId} OR o.creation_owner_id IS NULL) AND u.banned=1
                  AND EXISTS (SELECT 1 FROM member WHERE organization_id=${id} AND user_id=${userId} AND role='owner')
                  AND (SELECT COUNT(*) FROM member WHERE organization_id=${id})=1
                  AND NOT EXISTS (SELECT 1 FROM photo WHERE organization_id=${id} AND (instr(key,'org/'||${id}||'/')<>1 OR instr(thumbnail_key,'org/'||${id}||'/')<>1))
                  AND NOT EXISTS (SELECT 1 FROM asset WHERE organization_id=${id} AND instr(key,'org/'||${id}||'/')<>1)
                  AND NOT EXISTS (SELECT 1 FROM upload_reservation r WHERE organization_id=${id} AND status IN ('pending','cleanup')
                    AND (kind NOT IN ('photo','logo') OR json_valid(keys)<>1 OR json_type(keys)<>'array'
                      OR json_array_length(keys)<>CASE WHEN kind='photo' THEN 2 ELSE 1 END
                      OR EXISTS (SELECT 1 FROM json_each(r.keys) WHERE type<>'text' OR instr(value,'org/'||${id}||'/')<>1))))
      `
      const result = await batch([
        auditInsert(
          {
            organizationId: id,
            action: 'account.personal-content.staged',
            targetType: 'user',
            targetId: userId,
          },
          eligible,
        ),
        sql`
          INSERT INTO upload_reservation (id,organization_id,upload_id,kind,user_id,fingerprint,keys,bytes,status,expires_at)
                    SELECT lower(hex(randomblob(${UPLOAD_POLICY.receiptEntropyBytes}))),${id},id,'photo',${userId},'deletion',json_array(key,thumbnail_key),size+thumbnail_size,'cleanup',${now} FROM photo WHERE organization_id=${id} AND ${eligible}
                    UNION ALL SELECT lower(hex(randomblob(${UPLOAD_POLICY.receiptEntropyBytes}))),${id},id,'logo',${userId},'deletion',json_array(key),size,'cleanup',${now} FROM asset WHERE organization_id=${id} AND ${eligible}
        `,
        sql`UPDATE upload_reservation SET status='deleted' WHERE organization_id=${id} AND status='committed' AND ${eligible}`,
        sql`
          INSERT INTO upload_reservation (id,organization_id,upload_id,kind,user_id,fingerprint,keys,bytes,status,expires_at)
                    SELECT lower(hex(randomblob(${UPLOAD_POLICY.receiptEntropyBytes}))),${id},p.id,'photo',${userId},'deletion','[]',0,'deleted',0 FROM photo p WHERE p.organization_id=${id} AND ${eligible}
                      AND p.id NOT IN (SELECT upload_id FROM upload_reservation WHERE organization_id=${id} AND kind='photo' AND status='deleted')
                    UNION ALL SELECT lower(hex(randomblob(${UPLOAD_POLICY.receiptEntropyBytes}))),${id},a.id,'logo',${userId},'deletion','[]',0,'deleted',0 FROM asset a WHERE a.organization_id=${id} AND ${eligible}
                      AND a.id NOT IN (SELECT upload_id FROM upload_reservation WHERE organization_id=${id} AND kind='logo' AND status='deleted')
        `,
        sql`UPDATE share SET revoked_at=${now} WHERE organization_id=${id} AND revoked_at IS NULL AND ${eligible}`,
        sql`UPDATE upload_reservation SET status='cleanup' WHERE organization_id=${id} AND status='pending' AND ${eligible}`,
        sql`DELETE FROM watermark WHERE organization_id=${id} AND ${eligible}`,
        sql`DELETE FROM photo WHERE organization_id=${id} AND ${eligible}`,
        sql`DELETE FROM asset WHERE organization_id=${id} AND ${eligible}`,
        sql`
          DELETE FROM organization WHERE id=${id} AND ${eligible}
                    AND NOT EXISTS (SELECT 1 FROM upload_reservation WHERE organization_id=${id} AND status IN ('pending','cleanup'))
        `,
      ])
      if (result[0]?.meta.changes !== 1) throw apiErrors.retryLater()
    },
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
      const now = Date.now()
      const permission = workspaceWriter(input.organizationId, input.userId)
      const maxCount = workspaceCapacitySql(
        input.organizationId,
        input.kind === 'photo' ? 'photos' : 'logos',
        now,
      )
      const rows = await db.all<{
        id: string
      }>(sql`
        INSERT INTO upload_reservation (id, organization_id, upload_id, kind, user_id, fingerprint, keys, bytes, status, expires_at)
                SELECT ${input.id}, ${input.organizationId}, ${input.uploadId}, ${input.kind}, ${input.userId}, ${input.fingerprint}, ${JSON.stringify(input.keys)}, ${input.bytes}, 'pending', ${input.expiresAt.getTime()}
                WHERE ${permission} AND NOT EXISTS (SELECT 1 FROM ${records} WHERE organization_id = ${input.organizationId} AND id = ${input.uploadId})
                AND NOT EXISTS (SELECT 1 FROM upload_reservation WHERE organization_id = ${input.organizationId} AND kind = ${input.kind} AND upload_id = ${input.uploadId} AND status IN ('committed', 'deleted'))
                AND ${uploadCount(input.organizationId, input.kind)} < ${maxCount}
                AND ${usageBytes(input.organizationId)} + ${input.bytes} <= ${workspaceCapacitySql(input.organizationId, 'storageBytes', now)}
                ON CONFLICT DO NOTHING RETURNING id
      `)
      if (rows.length > 0) return 'reserved'
      const writer = await db.all(sql`SELECT 1 WHERE ${permission}`)
      if (writer.length === 0) throw apiErrors.forbidden()
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
    async isLeaseWritable(input) {
      const rows = await db.all(sql`
        SELECT id FROM upload_reservation WHERE id = ${input.id}
          AND organization_id = ${input.organizationId} AND user_id = ${input.userId}
          AND upload_id = ${input.uploadId} AND kind = ${input.kind}
          AND fingerprint = ${input.fingerprint} AND keys = ${JSON.stringify(input.keys)}
          AND status = 'pending' AND expires_at > ${Date.now()}
          AND ${workspaceWriter(input.organizationId, input.userId)}
      `)
      return rows.length === 1
    },
    async commit(input, record, audit) {
      const destination =
        record.kind === 'photo'
          ? folderDestination(input.organizationId, 'photo', record.value.folderId ?? null)
          : sql`1`
      const permission = workspaceWriter(input.organizationId, input.userId)
      const now = Date.now()
      const pending = sql`EXISTS (SELECT 1 FROM upload_reservation WHERE id = ${input.id} AND organization_id = ${input.organizationId} AND status = 'pending' AND expires_at > ${now})`
      const capacity = sql`
        ${uploadCount(input.organizationId, input.kind)} <= ${workspaceCapacitySql(input.organizationId, input.kind === 'photo' ? 'photos' : 'logos', now)}
                AND ${usageBytes(input.organizationId)} <= ${workspaceCapacitySql(input.organizationId, 'storageBytes', now)}
      `
      const ready = sql`${pending} AND ${permission} AND ${destination} AND ${capacity}`
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
          INSERT INTO photo (id, organization_id, name, key, thumbnail_key, thumbnail_size, content_type, size, width, height, preset_id, preset_name, created_by, created_at, folder_id, folder_revision)
                    SELECT ${item.id}, ${item.organizationId}, ${item.name}, ${item.key}, ${item.thumbnailKey}, ${item.thumbnailSize ?? 0}, ${item.contentType}, ${item.size}, ${item.width}, ${item.height}, ${item.presetId}, ${item.presetName}, ${item.createdBy}, ${Date.now()}, ${item.folderId ?? null}, 0 WHERE ${ready} RETURNING id
        `
      } else {
        insert = sql`
          INSERT INTO asset (id, organization_id, kind, name, key, content_type, size, width, height, created_by, created_at)
                    SELECT ${item.id}, ${item.organizationId}, ${item.kind}, ${item.name}, ${item.key}, ${item.contentType}, ${item.size}, ${item.width}, ${item.height}, ${item.createdBy}, ${Date.now()} WHERE ${ready} RETURNING id
        `
      }
      const records = input.kind === 'photo' ? photo : asset
      // The reservation remains counted until completion. Reusing the admission
      // condition after INSERT would count the new metadata a second time.
      const completed = sql`
        ${pending} AND EXISTS (SELECT 1 FROM ${records}
                WHERE id = ${input.uploadId} AND organization_id = ${input.organizationId}
                  AND key = ${value.key} AND created_by = ${input.userId})
      `
      const [created] = await batch([
        insert,
        auditInsert(audit, completed),
        sql`UPDATE upload_reservation SET status = 'committed' WHERE id = ${input.id} AND ${completed}`,
      ])
      if (created === undefined) throw new Error('Upload commit returned no result')
      if (created.results.length === 0) {
        const writer = await db.all(sql`SELECT 1 WHERE ${permission}`)
        if (writer.length === 0) throw apiErrors.forbidden()
        const target = await db.all(sql`SELECT 1 WHERE ${destination}`)
        if (target.length === 0) throw apiErrors.conflict()
        const permittedCapacity = await db.all(sql`SELECT 1 WHERE ${capacity}`)
        if (permittedCapacity.length === 0) throw apiErrors.quotaExceeded()
      }
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
      const [released] = await db
        .select({ organizationId: uploadReservation.organizationId })
        .from(uploadReservation)
        .where(and(eq(uploadReservation.id, id), eq(uploadReservation.status, 'cleanup')))
      if (released !== undefined)
        await batch([
          sql`DELETE FROM upload_reservation WHERE id=${id} AND organization_id=${released.organizationId} AND status='cleanup'`,
          finalizeRetiredPersonal(released.organizationId),
        ])
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
