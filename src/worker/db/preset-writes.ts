import { sql, type SQL } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'

import type { Database } from './client'
import { folderDestination, workspaceWriter } from './folder-guards'
import { watermark } from './schema'
import { watermarkSpecSchema } from '../../shared/watermark'
import type { AuditEntry } from '../audit'
import { apiErrors } from '../errors'
import type { WatermarkRecord, WatermarkStore } from '../stores'

const storedPresetSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  spec: z.string(),
  created_by: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  folder_id: z.string().nullable(),
  folder_revision: z.number(),
  folder_version_id: z.string().nullable(),
})

const permission = (org: string, audit: AuditEntry | undefined) =>
  audit === undefined ? sql`1` : workspaceWriter(org, audit.actorUserId ?? '')

/** Preset content and optional folder reassignment share one metadata/audit transaction. */
export function createPresetWriter(db: Database) {
  const dialect = new SQLiteSyncDialect()
  async function commit(
    statement: SQL,
    audit: AuditEntry | undefined,
  ): Promise<WatermarkRecord | null> {
    const statements = [statement]
    if (audit !== undefined)
      statements.push(sql`
        INSERT INTO audit_log (id, organization_id, actor_user_id, actor_name, action, target_type, target_id, metadata, created_at)
        SELECT ${crypto.randomUUID()}, ${audit.organizationId ?? null}, ${audit.actorUserId ?? null}, ${audit.actorName ?? null}, ${audit.action}, ${audit.targetType}, ${audit.targetId ?? null}, ${audit.metadata === undefined ? null : JSON.stringify(audit.metadata)}, ${Date.now()}
        WHERE changes() > 0
      `)
    const [result] = await db.$client.batch(
      statements.map((query) => {
        const compiled = dialect.sqlToQuery(query)
        return db.$client.prepare(compiled.sql).bind(...compiled.params)
      }),
    )
    const value = result?.results[0]
    if (value === undefined) return null
    const row = storedPresetSchema.parse(value)
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      spec: watermarkSpecSchema.parse(JSON.parse(row.spec)),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      folderId: row.folder_id,
      folderRevision: row.folder_revision,
      folderVersionId: row.folder_version_id,
    }
  }
  return {
    async create(
      input: Omit<WatermarkRecord, 'createdAt' | 'updatedAt'>,
      audit?: AuditEntry,
    ): Promise<WatermarkRecord> {
      const now = Date.now()
      const row = await commit(
        sql`
          INSERT INTO watermark (id, organization_id, name, spec, created_by, created_at, updated_at, folder_id, folder_revision)
                  SELECT ${input.id}, ${input.organizationId}, ${input.name}, ${JSON.stringify(input.spec)}, ${input.createdBy}, ${now}, ${now}, ${input.folderId ?? null}, 0
                  WHERE ${permission(input.organizationId, audit)} AND ${folderDestination(input.organizationId, 'preset', input.folderId ?? null)} RETURNING *
        `,
        audit,
      )
      if (row === null) throw apiErrors.conflict()
      return row
    },
    async update(
      organizationId: string,
      id: string,
      patch: Parameters<WatermarkStore['update']>[2],
      audit?: AuditEntry,
    ): Promise<WatermarkRecord | null> {
      const expected =
        patch.expectedUpdatedAt === undefined ? null : new Date(patch.expectedUpdatedAt).getTime()
      const destination =
        patch.folderId === undefined ? sql`${watermark.folderId}` : sql`${patch.folderId}`
      const version =
        patch.folderId === undefined
          ? sql`1`
          : sql`${watermark.folderRevision} = ${patch.expectedFolderRevision ?? 0} AND ${watermark.folderVersionId} IS ${patch.expectedFolderVersionId ?? null}`
      return await commit(
        sql`
          UPDATE watermark SET name = ${patch.name}, spec = ${JSON.stringify(patch.spec)},
                  folder_revision = folder_revision + CASE WHEN folder_id IS NOT ${destination} THEN 1 ELSE 0 END,
                  folder_version_id = CASE WHEN folder_id IS NOT ${destination} THEN ${patch.nextFolderVersionId ?? crypto.randomUUID()} ELSE folder_version_id END,
                  folder_id = ${destination}, updated_at = max(${Date.now()}, updated_at + 1)
                  WHERE organization_id = ${organizationId} AND id = ${id}
                    AND (${expected} IS NULL OR updated_at = ${expected}) AND ${version}
                    AND ${permission(organizationId, audit)} AND ${folderDestination(organizationId, 'preset', destination)} RETURNING *
        `,
        audit,
      )
    },
  }
}
