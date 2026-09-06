import { and, count, eq, sql } from 'drizzle-orm'

import type { AssetKind, AssetRecord, AssetStore, ObjectStore, WatermarkStore } from '../stores'
import type { Database } from './client'
import { asset, watermark } from './schema'

/** D1-backed preset store. Exercised by the Workers test project. */
export function createDrizzleWatermarkStore(db: Database): WatermarkStore {
  return {
    async listForOrganization(organizationId) {
      return await db
        .select()
        .from(watermark)
        .where(eq(watermark.organizationId, organizationId))
        .orderBy(watermark.updatedAt)
    },
    async find(organizationId, id) {
      const [row] = await db
        .select()
        .from(watermark)
        .where(and(eq(watermark.organizationId, organizationId), eq(watermark.id, id)))
        .limit(1)
      return row ?? null
    },
    async create(input) {
      const [row] = await db.insert(watermark).values(input).returning()
      if (row === undefined) {
        throw new Error('insert returned no row')
      }
      return row
    },
    async update(organizationId, id, patch) {
      const [row] = await db
        .update(watermark)
        .set({ name: patch.name, spec: patch.spec, updatedAt: new Date() })
        .where(and(eq(watermark.organizationId, organizationId), eq(watermark.id, id)))
        .returning()
      return row ?? null
    },
    async delete(organizationId, id) {
      const rows = await db
        .delete(watermark)
        .where(and(eq(watermark.organizationId, organizationId), eq(watermark.id, id)))
        .returning({ id: watermark.id })
      return rows.length > 0
    },
    async countReferencingAsset(organizationId, assetId) {
      const [row] = await db
        .select({ total: count() })
        .from(watermark)
        .where(
          and(
            eq(watermark.organizationId, organizationId),
            sql`json_extract(${watermark.spec}, '$.kind') = 'image'`,
            sql`json_extract(${watermark.spec}, '$.assetId') = ${assetId}`,
          ),
        )
      return row?.total ?? 0
    },
  }
}

function isAssetKind(value: string): value is AssetKind {
  return value === 'logo'
}

function toAssetRecord(row: typeof asset.$inferSelect): AssetRecord {
  if (!isAssetKind(row.kind)) {
    throw new TypeError(`unknown asset kind stored: ${row.kind}`)
  }
  return { ...row, kind: row.kind }
}

/** D1-backed asset metadata store. */
export function createDrizzleAssetStore(db: Database): AssetStore {
  return {
    async listForOrganization(organizationId, kind) {
      const rows = await db
        .select()
        .from(asset)
        .where(and(eq(asset.organizationId, organizationId), eq(asset.kind, kind)))
        .orderBy(asset.createdAt)
      return rows.map((row) => toAssetRecord(row))
    },
    async find(organizationId, id) {
      const [row] = await db
        .select()
        .from(asset)
        .where(and(eq(asset.organizationId, organizationId), eq(asset.id, id)))
        .limit(1)
      return row === undefined ? null : toAssetRecord(row)
    },
    async create(input) {
      const [row] = await db.insert(asset).values(input).returning()
      if (row === undefined) {
        throw new Error('insert returned no row')
      }
      return toAssetRecord(row)
    },
    async delete(organizationId, id) {
      const rows = await db
        .delete(asset)
        .where(and(eq(asset.organizationId, organizationId), eq(asset.id, id)))
        .returning({ id: asset.id })
      return rows.length > 0
    },
    async countForOrganization(organizationId, kind) {
      const [row] = await db
        .select({ total: count() })
        .from(asset)
        .where(and(eq(asset.organizationId, organizationId), eq(asset.kind, kind)))
      return row?.total ?? 0
    },
  }
}

/** R2-backed object store. */
export function createR2ObjectStore(bucket: R2Bucket): ObjectStore {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } })
    },
    async get(key) {
      const object = await bucket.get(key)
      if (object === null) {
        return null
      }
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        size: object.size,
      }
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}
