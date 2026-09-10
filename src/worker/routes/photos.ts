/**
 * Stored photos (PLAN.md M6): watermarked outputs kept in R2 with a
 * thumbnail and metadata in D1. Scoped to an organization and gated by the
 * `photo` permissions; viewers read, editors and above upload and delete.
 * Request bytes are bounded before parsing. Durable quota reservations precede R2 writes.
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
import { contentDigest, payloadFingerprint, syncOperationId } from '../sync'
import { cleanupUploads, persistUpload } from '../upload-lifecycle'
import { UPLOAD_POLICY } from '../upload-store'
import { imageContentDisposition, SNIFF_LENGTH, sniffImageType } from '../uploads'

/** Offline copies are account-scoped in IndexedDB; the shared HTTP cache must not survive sign-out. */
const PHOTO_CACHE_CONTROL = 'private, no-store'
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
      'content-disposition': imageContentDisposition(fileName),
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
      const usage = await c.get('services').uploads.usage(c.req.param('orgId'))
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
      const services = c.get('services')
      const { photos, watermarks } = services
      const operationId = syncOperationId(c.req.raw)
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
      const preset =
        fields.data.presetId === undefined
          ? null
          : await watermarks.find(organizationId, fields.data.presetId)
      const id = operationId ?? crypto.randomUUID()
      const session = c.get('session')
      const leaseId = crypto.randomUUID()
      const digest = await contentDigest(image.bytes)
      const thumbnailDigest = await contentDigest(thumbnail.bytes)
      const key = `${photoKey(organizationId, id)}/${leaseId}/${digest}`
      const thumbKey = `${thumbnailKey(organizationId, id)}/${leaseId}/${thumbnailDigest}`
      const uploadFields = fields.data
      function assertMatching(record: PhotoRecord) {
        if (
          record.createdBy !== session.user.id ||
          !record.key.startsWith(`${photoKey(organizationId, id)}/`) ||
          !record.key.endsWith(`/${digest}`) ||
          !record.thumbnailKey.startsWith(`${thumbnailKey(organizationId, id)}/`) ||
          !record.thumbnailKey.endsWith(`/${thumbnailDigest}`) ||
          record.name !== uploadFields.name ||
          record.width !== uploadFields.width ||
          record.height !== uploadFields.height ||
          record.presetId !== (preset?.id ?? null)
        )
          throw apiErrors.conflict()
      }
      const existing = operationId === null ? null : await photos.find(organizationId, id)
      if (existing !== null) {
        assertMatching(existing)
        return c.json(photoDtoSchema.parse(photoToDto(existing)), HTTP_STATUS.ok)
      }
      const value = {
        id,
        organizationId,
        name: fields.data.name,
        key,
        thumbnailKey: thumbKey,
        contentType: image.contentType,
        size: image.bytes.byteLength,
        thumbnailSize: thumbnail.bytes.byteLength,
        width: fields.data.width,
        height: fields.data.height,
        presetId: preset?.id ?? null,
        presetName: preset?.name ?? null,
        createdBy: session.user.id,
      }
      const fingerprint = await payloadFingerprint({
        digest,
        thumbnailDigest,
        ...fields.data,
        presetId: preset?.id ?? null,
      })
      const outcome = await persistUpload(
        services,
        {
          id: leaseId,
          uploadId: id,
          organizationId,
          kind: 'photo',
          userId: session.user.id,
          fingerprint,
          keys: [key, thumbKey],
          bytes: image.bytes.byteLength + thumbnail.bytes.byteLength,
          expiresAt: new Date(Date.now() + UPLOAD_POLICY.leaseMs),
        },
        { kind: 'photo', value },
        {
          organizationId,
          actorUserId: session.user.id,
          actorName: session.user.name,
          action: 'photo.uploaded',
          targetType: 'photo',
          targetId: id,
          metadata: { name: value.name, contentType: value.contentType, size: value.size },
        },
        [
          { key, bytes: image.bytes, contentType: image.contentType },
          { key: thumbKey, bytes: thumbnail.bytes, contentType: thumbnail.contentType },
        ],
      )
      const record = await photos.find(organizationId, id)
      if (record === null) throw apiErrors.retryLater()
      assertMatching(record)
      return c.json(
        photoDtoSchema.parse(photoToDto(record)),
        outcome === 'created' ? HTTP_STATUS.created : HTTP_STATUS.ok,
      )
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
      const services = c.get('services')
      const { photos, uploads } = services
      const records = await photos.findMany(organizationId, parsed.data.ids)
      const session = c.get('session')
      const deleted = await uploads.deletePhotos(organizationId, parsed.data.ids, {
        organizationId,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'photo.deleted',
        targetType: 'photo',
        targetId: records.length === 1 ? (records[0]?.id ?? '') : '',
        metadata: {
          count: records.length,
          ids: records.slice(0, AUDIT_ID_SAMPLE).map((record) => record.id),
        },
      })
      await cleanupUploads(services, organizationId)
      return c.json(photoDeleteResponseSchema.parse({ deleted }), HTTP_STATUS.ok)
    },
  )
