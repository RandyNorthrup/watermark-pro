import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'

import type {
  AssetKind,
  AssetRecord,
  AssetStore,
  ObjectStore,
  PhotoRecord,
  PhotoStore,
  WatermarkStore,
} from '../stores'
import type { Database } from './client'
import { asset, photo, watermark } from './schema'

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

/**
 * Cursor pagination on (created_at desc, id desc): the cursor is
 * `"<createdAtMs>:<id>"` of the last row, so a page is stable while photos
 * are inserted ahead of it.
 */
function decodeCursor(cursor: string | undefined): { createdAt: number; id: string } | null {
  if (cursor === undefined) {
    return null
  }
  const separator = cursor.indexOf(':')
  const createdAt = Number(cursor.slice(0, separator))
  const id = cursor.slice(separator + 1)
  if (id === '' || separator <= 0 || !Number.isFinite(createdAt)) {
    return null
  }
  return { createdAt, id }
}

function encodeCursor(record: PhotoRecord): string {
  return `${String(record.createdAt.getTime())}:${record.id}`
}

/** D1-backed photo store. */
export function createDrizzlePhotoStore(db: Database): PhotoStore {
  return {
    async list(organizationId, query) {
      const after = decodeCursor(query.cursor)
      const conditions = [eq(photo.organizationId, organizationId)]
      if (query.presetId !== undefined) {
        conditions.push(eq(photo.presetId, query.presetId))
      }
      if (query.search !== undefined && query.search !== '') {
        const pattern = `%${escapeLike(query.search)}%`
        conditions.push(sql`${photo.name} LIKE ${pattern} ESCAPE '\\'`)
      }
      if (after !== null) {
        const afterDate = new Date(after.createdAt)
        const sameInstant = and(eq(photo.createdAt, afterDate), lt(photo.id, after.id))
        const olderOrSame = or(lt(photo.createdAt, afterDate), sameInstant)
        conditions.push(olderOrSame ?? sql`1 = 1`)
      }
      const rows = await db
        .select()
        .from(photo)
        .where(and(...conditions))
        .orderBy(desc(photo.createdAt), desc(photo.id))
        .limit(query.limit + 1)
      const page = rows.slice(0, query.limit)
      const last = page.at(-1)
      return {
        photos: page,
        nextCursor: last !== undefined && rows.length > query.limit ? encodeCursor(last) : null,
      }
    },
    async find(organizationId, id) {
      const [row] = await db
        .select()
        .from(photo)
        .where(and(eq(photo.organizationId, organizationId), eq(photo.id, id)))
        .limit(1)
      return row ?? null
    },
    async findMany(organizationId, ids) {
      if (ids.length === 0) {
        return []
      }
      return await db
        .select()
        .from(photo)
        .where(and(eq(photo.organizationId, organizationId), inArray(photo.id, [...ids])))
    },
    async create(input) {
      const [row] = await db.insert(photo).values(input).returning()
      if (row === undefined) {
        throw new Error('insert returned no row')
      }
      return row
    },
    async deleteMany(organizationId, ids) {
      if (ids.length === 0) {
        return 0
      }
      const rows = await db
        .delete(photo)
        .where(and(eq(photo.organizationId, organizationId), inArray(photo.id, [...ids])))
        .returning({ id: photo.id })
      return rows.length
    },
    async usage(organizationId) {
      const [row] = await db
        .select({ count: count(), bytes: sql<number>`coalesce(sum(${photo.size}), 0)` })
        .from(photo)
        .where(eq(photo.organizationId, organizationId))
      return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 }
    },
  }
}

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/g, (match) => `\\${match}`)
}
