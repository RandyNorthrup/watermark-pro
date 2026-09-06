/**
 * Stored photos (PLAN.md M6): watermarked outputs kept in R2 with a
 * thumbnail and metadata in D1. Scoped to an organization and gated by the
 * `photo` permissions; viewers read, editors and above upload and delete.
 * Quotas (per file, per organization count and bytes) are enforced before
 * any byte is read into memory.
 */
import { type Context, Hono } from 'hono'

import {
  photoDeleteRequestSchema,
  photoDeleteResponseSchema,
  photoDtoSchema,
  photoListQuerySchema,
  photoListResponseSchema,
  photoUploadFieldsSchema,
  storageUsageSchema,
} from '../../shared/api'
import {
  HTTP_STATUS,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ORGANIZATION,
  MAX_STORAGE_BYTES_PER_ORGANIZATION,
  MAX_THUMBNAIL_BYTES,
  PHOTO_CONTENT_TYPES,
  PHOTO_PAGE_SIZE,
} from '../../shared/constants'
import type { AppContext } from '../app-context'
import { photoToDto } from '../dto'
import { apiErrors } from '../errors'
import { requirePermission } from '../middleware/permission'
import { requireSession } from '../middleware/session'
import type { PhotoRecord, StoredObject } from '../stores'
import { SNIFF_LENGTH, sniffImageType } from '../uploads'

/** Photos are the user's own work; browsers may cache them privately for a day. */
const PHOTO_CACHE_CONTROL = 'private, max-age=86400'
const AUDIT_ID_SAMPLE = 20

function photoKey(organizationId: string, photoId: string): string {
  return `org/${organizationId}/photos/${photoId}`
}

function thumbnailKey(organizationId: string, photoId: string): string {
  return `org/${organizationId}/thumbnails/${photoId}`
}

function isPhotoType(
  contentType: string | null,
): contentType is (typeof PHOTO_CONTENT_TYPES)[number] {
  return contentType !== null && (PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType)
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw apiErrors.validation('request body must be JSON')
  }
}

/** Reads a multipart file field, rejecting anything that is not a supported image. */
async function imageField(form: FormData, field: string, maxBytes: number) {
  const file = form.get(field)
  if (!(file instanceof File)) {
    throw apiErrors.validation({ [field]: 'missing' })
  }
  if (file.size > maxBytes) {
    throw apiErrors.payloadTooLarge()
  }
  const bytes = await file.arrayBuffer()
  const contentType = sniffImageType(new Uint8Array(bytes.slice(0, SNIFF_LENGTH)))
  if (!isPhotoType(contentType)) {
    throw apiErrors.unsupportedMedia()
  }
  return { bytes, contentType, name: file.name }
}

function streamObject(stored: StoredObject, contentType: string, fileName: string): Response {
  return new Response(stored.body, {
    status: HTTP_STATUS.ok,
    headers: {
      'content-type': contentType,
      'content-length': String(stored.size),
      'cache-control': PHOTO_CACHE_CONTROL,
      'content-disposition': `inline; filename="${fileName.replaceAll('"', '')}"`,
    },
  })
}

async function findPhoto(c: Context<AppContext>): Promise<PhotoRecord> {
  const organizationId = c.req.param('orgId')
  const id = c.req.param('id')
  if (organizationId === undefined || id === undefined) {
    throw apiErrors.notFound()
  }
  const record = await c.get('services').photos.find(organizationId, id)
  if (record === null) {
    throw apiErrors.notFound()
  }
  return record
}

export const photoRoutes = new Hono<AppContext>()
  .get('/orgs/:orgId/photos', requireSession, requirePermission({ photo: ['read'] }), async (c) => {
    const parsed = photoListQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      throw apiErrors.validation(parsed.error.issues)
    }
    const page = await c
      .get('services')
      .photos.list(c.req.param('orgId'), { ...parsed.data, limit: PHOTO_PAGE_SIZE })
    return c.json(
      photoListResponseSchema.parse({
        photos: page.photos.map((record) => photoToDto(record)),
        nextCursor: page.nextCursor,
      }),
      HTTP_STATUS.ok,
    )
  })
  .get(
    '/orgs/:orgId/photos/usage',
    requireSession,
    requirePermission({ photo: ['read'] }),
    async (c) => {
      const usage = await c.get('services').photos.usage(c.req.param('orgId'))
      return c.json(
        storageUsageSchema.parse({
          ...usage,
          maxCount: MAX_PHOTOS_PER_ORGANIZATION,
          maxBytes: MAX_STORAGE_BYTES_PER_ORGANIZATION,
        }),
        HTTP_STATUS.ok,
      )
    },
  )
  .post(
    '/orgs/:orgId/photos',
    requireSession,
    requirePermission({ photo: ['upload'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const { photos, objects, watermarks, audit } = c.get('services')
      const declaredLength = Number(c.req.header('content-length') ?? '0')
      if (declaredLength > MAX_PHOTO_BYTES + MAX_THUMBNAIL_BYTES) {
        throw apiErrors.payloadTooLarge()
      }
      const usage = await photos.usage(organizationId)
      if (usage.count >= MAX_PHOTOS_PER_ORGANIZATION) {
        throw apiErrors.quotaExceeded()
      }
      let form: FormData
      try {
        form = await c.req.raw.formData()
      } catch {
        throw apiErrors.validation('multipart form data expected')
      }
      const fields = photoUploadFieldsSchema.safeParse({
        name: form.get('name'),
        width: form.get('width'),
        height: form.get('height'),
        presetId: form.get('presetId') ?? undefined,
      })
      if (!fields.success) {
        throw apiErrors.validation(fields.error.issues)
      }
      const image = await imageField(form, 'file', MAX_PHOTO_BYTES)
      const thumbnail = await imageField(form, 'thumbnail', MAX_THUMBNAIL_BYTES)
      if (usage.bytes + image.bytes.byteLength > MAX_STORAGE_BYTES_PER_ORGANIZATION) {
        throw apiErrors.quotaExceeded()
      }
      const preset =
        fields.data.presetId === undefined
          ? null
          : await watermarks.find(organizationId, fields.data.presetId)
      const id = crypto.randomUUID()
      const key = photoKey(organizationId, id)
      const thumbKey = thumbnailKey(organizationId, id)
      await Promise.all([
        objects.put(key, image.bytes, image.contentType),
        objects.put(thumbKey, thumbnail.bytes, thumbnail.contentType),
      ])
      const session = c.get('session')
      const record = await photos.create({
        id,
        organizationId,
        name: fields.data.name,
        key,
        thumbnailKey: thumbKey,
        contentType: image.contentType,
        size: image.bytes.byteLength,
        width: fields.data.width,
        height: fields.data.height,
        presetId: preset?.id ?? null,
        presetName: preset?.name ?? null,
        createdBy: session.user.id,
      })
      await audit.append({
        organizationId,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'photo.uploaded',
        targetType: 'photo',
        targetId: id,
        metadata: { name: record.name, contentType: record.contentType, size: record.size },
      })
      return c.json(photoDtoSchema.parse(photoToDto(record)), HTTP_STATUS.created)
    },
  )
  .get(
    '/orgs/:orgId/photos/:id/file',
    requireSession,
    requirePermission({ photo: ['read'] }),
    async (c) => {
      const record = await findPhoto(c)
      const stored = await c.get('services').objects.get(record.key)
      if (stored === null) {
        throw apiErrors.notFound()
      }
      return streamObject(stored, record.contentType, record.name)
    },
  )
  .get(
    '/orgs/:orgId/photos/:id/thumbnail',
    requireSession,
    requirePermission({ photo: ['read'] }),
    async (c) => {
      const record = await findPhoto(c)
      const stored = await c.get('services').objects.get(record.thumbnailKey)
      if (stored === null) {
        throw apiErrors.notFound()
      }
      return streamObject(stored, stored.contentType, `thumbnail-${record.name}`)
    },
  )
  .post(
    '/orgs/:orgId/photos/delete',
    requireSession,
    requirePermission({ photo: ['delete'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const parsed = photoDeleteRequestSchema.safeParse(await parseJson(c.req.raw))
      if (!parsed.success) {
        throw apiErrors.validation(parsed.error.issues)
      }
      const { photos, objects, audit } = c.get('services')
      const records = await photos.findMany(organizationId, parsed.data.ids)
      await Promise.all(
        records.flatMap((record) => [
          objects.delete(record.key),
          objects.delete(record.thumbnailKey),
        ]),
      )
      const deleted = await photos.deleteMany(
        organizationId,
        records.map((record) => record.id),
      )
      if (deleted > 0) {
        const session = c.get('session')
        await audit.append({
          organizationId,
          actorUserId: session.user.id,
          actorName: session.user.name,
          action: 'photo.deleted',
          targetType: 'photo',
          targetId: records.length === 1 ? (records[0]?.id ?? '') : '',
          metadata: {
            count: deleted,
            ids: records.slice(0, AUDIT_ID_SAMPLE).map((record) => record.id),
          },
        })
      }
      return c.json(photoDeleteResponseSchema.parse({ deleted }), HTTP_STATUS.ok)
    },
  )
