import { and, eq, getTableColumns, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'

import type { Database } from './client'
import { folderDestination, workspaceWriter } from './folder-guards'
import { auditLog, photo, watermark, workspaceFolder } from './schema'
import { MILLISECONDS_PER_SECOND } from '../../shared/constants'
import {
  FOLDER_POLICY,
  folderDtoSchema,
  folderNameKey,
  folderWriteResultSchema,
  type FolderKind,
} from '../../shared/folders'
import type { FolderStore, FolderWriteContext, FolderWriteOutcome } from '../folder-store'

const receiptSchema = z.object({ fingerprint: z.string(), result: folderWriteResultSchema })
const readable = (organizationId: string, userId: string) => sql`
  EXISTS (
    SELECT 1 FROM member AS folder_reader JOIN user AS folder_account ON folder_account.id = folder_reader.user_id
    WHERE folder_reader.organization_id = ${organizationId} AND folder_reader.user_id = ${userId}
      AND folder_reader.role IN ('owner', 'admin', 'editor', 'viewer')
      AND folder_account.email_verified = 1 AND coalesce(folder_account.banned, 0) = 0
  )
`

function siblingAvailable(
  organizationId: string,
  kind: FolderKind | SQLWrapper,
  parentId: string | null,
  name: string,
  ownId: string,
) {
  return sql`
    NOT EXISTS (SELECT 1 FROM workspace_folder AS sibling WHERE sibling.organization_id = ${organizationId}
        AND sibling.kind = ${kind} AND sibling.parent_id IS ${parentId} AND sibling.name_key = ${folderNameKey(name)} AND sibling.id <> ${ownId})
  `
}

/** Bound both walks so a damaged existing tree cannot make a recursive query unbounded. */
function treeDestination(
  organizationId: string,
  kind: FolderKind | SQLWrapper,
  parentId: string | null,
  id: string,
) {
  return sql`
    ${folderDestination(organizationId, kind, parentId)} AND (
        WITH RECURSIVE ancestors(id, parent_id, depth) AS (
          SELECT id, parent_id, 1 FROM workspace_folder WHERE id = ${parentId} AND organization_id = ${organizationId}
          UNION ALL SELECT parent.id, parent.parent_id, ancestors.depth + 1 FROM workspace_folder AS parent JOIN ancestors ON parent.id = ancestors.parent_id
          WHERE ancestors.depth <= ${FOLDER_POLICY.maxDepth}
        ), descendants(id, depth) AS (
          SELECT id, 0 FROM workspace_folder WHERE id = ${id} AND organization_id = ${organizationId}
          UNION ALL SELECT child.id, descendants.depth + 1 FROM workspace_folder AS child JOIN descendants ON child.parent_id = descendants.id
          WHERE descendants.depth <= ${FOLDER_POLICY.maxDepth}
        ) SELECT NOT EXISTS (SELECT 1 FROM ancestors WHERE id = ${id})
          AND coalesce((SELECT max(depth) FROM ancestors), 0) + 1 + coalesce((SELECT max(depth) FROM descendants), 0) <= ${FOLDER_POLICY.maxDepth}
      )
  `
}

function folderResult(
  organizationId: string,
  id: string,
  name: string,
  parentId: string | null,
  updatedAt: string,
  versionId: string,
) {
  return sql`
    (SELECT json_object('folder', json_object(
        'id', id, 'organizationId', organization_id, 'kind', kind, 'name', ${name}, 'parentId', ${parentId}, 'revision', revision + 1, 'versionId', ${versionId},
        'createdBy', created_by, 'createdAt', strftime('%Y-%m-%dT%H:%M:%fZ', created_at / CAST(${MILLISECONDS_PER_SECOND} AS REAL), 'unixepoch'),
        'updatedAt', ${updatedAt},
        'childCount', (SELECT count(*) FROM workspace_folder AS child WHERE child.organization_id = workspace_folder.organization_id AND child.kind = workspace_folder.kind AND child.parent_id = workspace_folder.id),
        'itemCount', (SELECT count(*) FROM photo WHERE organization_id = workspace_folder.organization_id AND folder_id = workspace_folder.id) + (SELECT count(*) FROM watermark WHERE organization_id = workspace_folder.organization_id AND folder_id = workspace_folder.id)
      ), 'moved', json('[]')) FROM workspace_folder WHERE organization_id = ${organizationId} AND id = ${id})
  `
}

/** Audit receipts and mutations commit together; a retried operation never mutates twice. */
export function createDrizzleFolderStore(db: Database): FolderStore {
  const dialect = new SQLiteSyncDialect()
  const prepare = (statement: SQL) => {
    const query = dialect.sqlToQuery(statement)
    return db.$client.prepare(query.sql).bind(...query.params)
  }
  async function execute(
    context: FolderWriteContext,
    targetId: string,
    action: string,
    valid: SQL,
    result: SQL,
    mutation: (receipt: SQL) => SQL,
  ): Promise<FolderWriteOutcome> {
    const permission = workspaceWriter(context.organizationId, context.actorId)
    const authorized = await db.all(sql`SELECT 1 WHERE ${permission}`)
    if (authorized.length === 0) return { status: 'forbidden' }
    const attempt = crypto.randomUUID()
    const freshReceipt = sql`EXISTS (SELECT 1 FROM audit_log WHERE id = ${context.operationId} AND organization_id = ${context.organizationId} AND actor_user_id = ${context.actorId} AND json_extract(metadata, '$.attempt') = ${attempt})`
    await db.$client.batch([
      prepare(sql`
        INSERT INTO audit_log (id, organization_id, actor_user_id, actor_name, action, target_type, target_id, metadata, created_at)
                SELECT ${context.operationId}, ${context.organizationId}, ${context.actorId}, ${context.actorName}, ${action}, 'folder', ${targetId},
                  json_object('attempt', ${attempt}, 'fingerprint', ${context.fingerprint}, 'result', json(${result})), ${Date.now()}
                WHERE ${permission} AND ${valid} AND NOT EXISTS (SELECT 1 FROM audit_log WHERE id = ${context.operationId})
      `),
      prepare(mutation(freshReceipt)),
    ])
    const [receipt] = await db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.id, context.operationId),
          eq(auditLog.organizationId, context.organizationId),
          eq(auditLog.actorUserId, context.actorId),
          permission,
        ),
      )
    if (receipt === undefined) return { status: 'conflict' }
    const parsed = receiptSchema.safeParse(receipt.metadata)
    if (!parsed.success || parsed.data.fingerprint !== context.fingerprint)
      return { status: 'conflict' }
    return { status: 'applied', value: parsed.data.result }
  }
  return {
    async list(organizationId, userId, kind) {
      const permission = readable(organizationId, userId)
      const allowed = await db.all(sql`SELECT 1 WHERE ${permission}`)
      if (allowed.length === 0) return null
      const rows = await db
        .select({
          ...getTableColumns(workspaceFolder),
          childCount: sql<number>`(SELECT count(*) FROM workspace_folder AS child WHERE child.organization_id = ${organizationId} AND child.kind = ${kind} AND child.parent_id = ${workspaceFolder.id})`,
          itemCount: sql<number>`(SELECT count(*) FROM photo WHERE organization_id = ${organizationId} AND folder_id = ${workspaceFolder.id}) + (SELECT count(*) FROM watermark WHERE organization_id = ${organizationId} AND folder_id = ${workspaceFolder.id})`,
        })
        .from(workspaceFolder)
        .where(
          and(
            eq(workspaceFolder.organizationId, organizationId),
            eq(workspaceFolder.kind, kind),
            permission,
          ),
        )
        .orderBy(workspaceFolder.nameKey, workspaceFolder.id)
      return rows.map((row) =>
        folderDtoSchema.parse({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      )
    },
    async exists(organizationId, kind, id) {
      const rows = await db.all(sql`SELECT 1 WHERE ${folderDestination(organizationId, kind, id)}`)
      return rows.length > 0
    },
    async create(context, input) {
      const now = new Date()
      const value = {
        folder: {
          ...input,
          organizationId: context.organizationId,
          revision: 0,
          versionId: context.operationId,
          createdBy: context.actorId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          childCount: 0,
          itemCount: 0,
        },
        moved: [],
      }
      const valid = sql`
        ${treeDestination(context.organizationId, input.kind, input.parentId, input.id)}
                AND ${siblingAvailable(context.organizationId, input.kind, input.parentId, input.name, input.id)}
                AND NOT EXISTS (SELECT 1 FROM workspace_folder WHERE id = ${input.id})
                AND (SELECT count(*) FROM workspace_folder WHERE organization_id = ${context.organizationId}) < ${FOLDER_POLICY.maxFolders}
      `
      return await execute(
        context,
        input.id,
        'folder.created',
        valid,
        sql`${JSON.stringify(value)}`,
        (receipt) => sql`
          INSERT INTO workspace_folder (id, organization_id, kind, name, name_key, parent_id, revision, version_id, created_by, created_at, updated_at)
          SELECT ${input.id}, ${context.organizationId}, ${input.kind}, ${input.name}, ${folderNameKey(input.name)}, ${input.parentId}, 0, ${context.operationId}, ${context.actorId}, ${now.getTime()}, ${now.getTime()} WHERE ${receipt}
        `,
      )
    },
    async update(context, id, input) {
      const now = new Date()
      const kind = sql`(SELECT kind FROM workspace_folder WHERE organization_id = ${context.organizationId} AND id = ${id})`
      const valid = sql`
        EXISTS (SELECT 1 FROM workspace_folder WHERE organization_id = ${context.organizationId} AND id = ${id} AND revision = ${input.expectedRevision} AND version_id = ${input.expectedVersionId})
                AND ${treeDestination(context.organizationId, kind, input.parentId, id)}
                AND ${siblingAvailable(context.organizationId, kind, input.parentId, input.name, id)}
      `
      return await execute(
        context,
        id,
        'folder.updated',
        valid,
        folderResult(
          context.organizationId,
          id,
          input.name,
          input.parentId,
          now.toISOString(),
          context.operationId,
        ),
        (receipt) => sql`
          UPDATE workspace_folder SET name = ${input.name}, name_key = ${folderNameKey(input.name)}, parent_id = ${input.parentId}, revision = revision + 1, version_id = ${context.operationId}, updated_at = ${now.getTime()}
          WHERE organization_id = ${context.organizationId} AND id = ${id} AND ${receipt}
        `,
      )
    },
    async delete(context, id, expectedRevision, expectedVersionId) {
      const valid = sql`
        EXISTS (SELECT 1 FROM workspace_folder WHERE organization_id = ${context.organizationId} AND id = ${id} AND revision = ${expectedRevision} AND version_id = ${expectedVersionId})
                AND NOT EXISTS (SELECT 1 FROM workspace_folder WHERE parent_id = ${id})
                AND NOT EXISTS (SELECT 1 FROM photo WHERE folder_id = ${id})
                AND NOT EXISTS (SELECT 1 FROM watermark WHERE folder_id = ${id})
      `
      return await execute(
        context,
        id,
        'folder.deleted',
        valid,
        sql`${JSON.stringify({ folder: null, moved: [] })}`,
        (receipt) =>
          sql`DELETE FROM workspace_folder WHERE organization_id = ${context.organizationId} AND id = ${id} AND ${receipt}`,
      )
    },
    async moveContent(context, input) {
      const table = input.kind === 'photo' ? photo : watermark
      const expectedItems = JSON.stringify(input.items)
      const scope = sql`
        ${table.organizationId} = ${context.organizationId} AND EXISTS (
                SELECT 1 FROM json_each(${expectedItems}) AS requested WHERE json_extract(requested.value, '$.id') = ${table.id}
                  AND json_extract(requested.value, '$.expectedFolderRevision') = ${table.folderRevision}
          AND json_extract(requested.value, '$.expectedFolderVersionId') IS ${table.folderVersionId}
              )
      `
      const valid = sql`${folderDestination(context.organizationId, input.kind, input.folderId)} AND (SELECT count(*) FROM ${table} WHERE ${scope}) = ${input.items.length}`
      const result = sql`(SELECT json_object('folder', NULL, 'moved', json_group_array(json_object('id', ${table.id}, 'organizationId', ${table.organizationId}, 'kind', ${input.kind}, 'folderId', ${input.folderId}, 'folderRevision', ${table.folderRevision} + 1, 'folderVersionId', ${context.operationId}))) FROM ${table} WHERE ${scope})`
      return await execute(
        context,
        input.folderId ?? 'root',
        'folder.content_moved',
        valid,
        result,
        (receipt) =>
          sql`UPDATE ${table} SET folder_id = ${input.folderId}, folder_revision = folder_revision + 1, folder_version_id = ${context.operationId} WHERE ${scope} AND ${receipt}`,
      )
    },
  }
}
