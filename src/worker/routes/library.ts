/**
 * Watermark library: saved presets and the logo assets they reference.
 * Every route is scoped to an organization and gated by the `watermark`
 * permissions; owners, admins and editors manage, viewers read.
 */
import { type Context, Hono } from 'hono'

import { assetDtoSchema, assetListResponseSchema, assetUploadFieldsSchema } from '../../shared/api'
import {
  type SaveWatermarkRequest,
  saveWatermarkRequestSchema,
  watermarkDtoSchema,
  watermarkListResponseSchema,
} from '../../shared/api-watermark'
import { HTTP_STATUS, LOGO_CONTENT_TYPES, MAX_LOGO_BYTES } from '../../shared/constants'
import type { WatermarkSpec } from '../../shared/watermark'
import type { AppContext } from '../app-context'
import { assetToDto, watermarkToDto } from '../dto'
import { apiErrors } from '../errors'
import { requirePermission } from '../middleware/permission'
import { requireSession } from '../middleware/session'
import type { AssetRecord, WatermarkRecord } from '../stores'
import { contentDigest, payloadFingerprint, syncOperationId } from '../sync'
import { cleanupUploads, persistUpload } from '../upload-lifecycle'
import { UPLOAD_POLICY } from '../upload-store'
import { SNIFF_LENGTH, sniffImageType } from '../uploads'

const ASSET_CACHE_CONTROL = 'private, no-store'

function isMatchingPreset(record: WatermarkRecord, body: SaveWatermarkRequest): boolean {
  return record.name === body.name && JSON.stringify(record.spec) === JSON.stringify(body.spec)
}

function logoKey(organizationId: string, assetId: string, digest: string): string {
  return `org/${organizationId}/logos/${assetId}/${digest}`
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw apiErrors.validation('request body must be JSON')
  }
}

/** Image marks may only reference logos that belong to the same organization. */
async function assertAssetOwned(
  c: Context<AppContext>,
  organizationId: string,
  spec: WatermarkSpec,
): Promise<void> {
  if (spec.kind !== 'image') {
    return
  }
  const asset = await c.get('services').assets.find(organizationId, spec.assetId)
  if (asset === null) {
    throw apiErrors.validation({ assetId: 'unknown logo' })
  }
}

/** Validates a create or update body, including the logo reference. */
async function parseSaveRequest(
  c: Context<AppContext>,
  organizationId: string,
): Promise<SaveWatermarkRequest> {
  const parsed = saveWatermarkRequestSchema.safeParse(await parseJson(c.req.raw))
  if (!parsed.success) {
    throw apiErrors.validation(parsed.error.issues)
  }
  await assertAssetOwned(c, organizationId, parsed.data.spec)
  return parsed.data
}

export const libraryRoutes = new Hono<AppContext>()
  .get(
    '/orgs/:orgId/watermarks',
    requireSession,
    requirePermission({ watermark: ['read'] }),
    async (c) => {
      const records = await c.get('services').watermarks.listForOrganization(c.req.param('orgId'))
      return c.json(
        watermarkListResponseSchema.parse({
          watermarks: records.map((record) => watermarkToDto(record)),
        }),
        HTTP_STATUS.ok,
      )
    },
  )
  .post(
    '/orgs/:orgId/watermarks',
    requireSession,
    requirePermission({ watermark: ['create'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const body = await parseSaveRequest(c, organizationId)
      const { watermarks, audit } = c.get('services')
      const session = c.get('session')
      const operationId = syncOperationId(c.req.raw)
      const id = operationId ?? crypto.randomUUID()
      const existing = operationId === null ? null : await watermarks.find(organizationId, id)
      if (existing !== null) {
        if (existing.createdBy !== session.user.id || !isMatchingPreset(existing, body)) {
          throw apiErrors.conflict()
        }
        return c.json(watermarkDtoSchema.parse(watermarkToDto(existing)), HTTP_STATUS.ok)
      }
      const record = await watermarks.create({
        id,
        organizationId,
        name: body.name,
        spec: body.spec,
        createdBy: session.user.id,
      })
      await audit.append({
        organizationId,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'watermark.created',
        targetType: 'watermark',
        targetId: record.id,
        metadata: { name: record.name, kind: record.spec.kind },
      })
      return c.json(watermarkDtoSchema.parse(watermarkToDto(record)), HTTP_STATUS.created)
    },
  )
  .put(
    '/orgs/:orgId/watermarks/:id',
    requireSession,
    requirePermission({ watermark: ['update'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const body = await parseSaveRequest(c, organizationId)
      const { watermarks, audit } = c.get('services')
      const existing = await watermarks.find(organizationId, c.req.param('id'))
      if (
        existing !== null &&
        body.expectedUpdatedAt !== undefined &&
        isMatchingPreset(existing, body)
      ) {
        return c.json(watermarkDtoSchema.parse(watermarkToDto(existing)), HTTP_STATUS.ok)
      }
      const record = await watermarks.update(organizationId, c.req.param('id'), body)
      if (record === null) {
        if (existing !== null && body.expectedUpdatedAt !== undefined) {
          throw apiErrors.conflict()
        }
        throw apiErrors.notFound()
      }
      const session = c.get('session')
      await audit.append({
        organizationId,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'watermark.updated',
        targetType: 'watermark',
        targetId: record.id,
        metadata: { name: record.name, kind: record.spec.kind },
      })
      return c.json(watermarkDtoSchema.parse(watermarkToDto(record)), HTTP_STATUS.ok)
    },
  )
  .delete(
    '/orgs/:orgId/watermarks/:id',
    requireSession,
    requirePermission({ watermark: ['delete'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const { watermarks, audit } = c.get('services')
      const isDeleted = await watermarks.delete(organizationId, c.req.param('id'))
      if (!isDeleted) {
        throw apiErrors.notFound()
      }
      const session = c.get('session')
      await audit.append({
        organizationId,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'watermark.deleted',
        targetType: 'watermark',
        targetId: c.req.param('id'),
      })
      return c.body(null, HTTP_STATUS.noContent)
    },
  )
  .get(
    '/orgs/:orgId/assets',
    requireSession,
    requirePermission({ watermark: ['read'] }),
    async (c) => {
      const records = await c
        .get('services')
        .assets.listForOrganization(c.req.param('orgId'), 'logo')
      return c.json(
        assetListResponseSchema.parse({ assets: records.map((record) => assetToDto(record)) }),
        HTTP_STATUS.ok,
      )
    },
  )
  .post(
    '/orgs/:orgId/assets',
    requireSession,
    requirePermission({ watermark: ['create'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const services = c.get('services')
      const { assets } = services
      let form: FormData
      try {
        form = await c.req.raw.formData()
      } catch {
        throw apiErrors.validation('multipart form data expected')
      }
      const file = form.get('file')
      if (!(file instanceof File)) {
        throw apiErrors.validation({ file: 'missing' })
      }
      if (file.size > MAX_LOGO_BYTES) {
        throw apiErrors.payloadTooLarge()
      }
      const fields = assetUploadFieldsSchema.safeParse({
        name: form.get('name') ?? file.name,
        width: form.get('width'),
        height: form.get('height'),
      })
      if (!fields.success) {
        throw apiErrors.validation(fields.error.issues)
      }
      const bytes = await file.arrayBuffer()
      const contentType = sniffImageType(new Uint8Array(bytes.slice(0, SNIFF_LENGTH)))
      if (
        contentType === null ||
        !(LOGO_CONTENT_TYPES as readonly string[]).includes(contentType)
      ) {
        throw apiErrors.unsupportedMedia()
      }
      const session = c.get('session')
      const operationId = syncOperationId(c.req.raw)
      const id = operationId ?? crypto.randomUUID()
      const digest = await contentDigest(bytes)
      const leaseId = crypto.randomUUID()
      const key = logoKey(organizationId, id, `${leaseId}/${digest}`)
      const uploadFields = fields.data
      function assertMatching(record: AssetRecord) {
        if (
          record.createdBy !== session.user.id ||
          !record.key.startsWith(`org/${organizationId}/logos/${id}/`) ||
          !record.key.endsWith(`/${digest}`) ||
          record.name !== uploadFields.name ||
          record.width !== uploadFields.width ||
          record.height !== uploadFields.height
        )
          throw apiErrors.conflict()
      }
      const existing = operationId === null ? null : await assets.find(organizationId, id)
      if (existing !== null) {
        assertMatching(existing)
        return c.json(assetDtoSchema.parse(assetToDto(existing)), HTTP_STATUS.ok)
      }
      const value: Omit<AssetRecord, 'createdAt'> = {
        id,
        organizationId,
        kind: 'logo',
        name: fields.data.name,
        key,
        contentType,
        size: bytes.byteLength,
        width: fields.data.width,
        height: fields.data.height,
        createdBy: session.user.id,
      }
      const fingerprint = await payloadFingerprint({ digest, ...fields.data })
      const outcome = await persistUpload(
        services,
        {
          id: leaseId,
          uploadId: id,
          organizationId,
          kind: 'logo',
          userId: session.user.id,
          fingerprint,
          keys: [key],
          bytes: bytes.byteLength,
          expiresAt: new Date(Date.now() + UPLOAD_POLICY.leaseMs),
        },
        { kind: 'logo', value },
        {
          organizationId,
          actorUserId: session.user.id,
          actorName: session.user.name,
          action: 'asset.uploaded',
          targetType: 'asset',
          targetId: id,
          metadata: { name: value.name, contentType, size: value.size },
        },
        [{ key, bytes, contentType }],
      )
      const record = await assets.find(organizationId, id)
      if (record === null) throw apiErrors.retryLater()
      assertMatching(record)
      return c.json(
        assetDtoSchema.parse(assetToDto(record)),
        outcome === 'created' ? HTTP_STATUS.created : HTTP_STATUS.ok,
      )
    },
  )
  .get(
    '/orgs/:orgId/assets/:id/file',
    requireSession,
    requirePermission({ watermark: ['read'] }),
    async (c) => {
      const { assets, objects } = c.get('services')
      const record = await assets.find(c.req.param('orgId'), c.req.param('id'))
      if (record === null) {
        throw apiErrors.notFound()
      }
      const stored = await objects.get(record.key)
      if (stored === null) {
        throw apiErrors.notFound()
      }
      return new Response(stored.body, {
        status: HTTP_STATUS.ok,
        headers: {
          'content-type': record.contentType,
          'content-length': String(stored.size),
          'cache-control': ASSET_CACHE_CONTROL,
          'content-disposition': 'inline',
        },
      })
    },
  )
  .delete(
    '/orgs/:orgId/assets/:id',
    requireSession,
    requirePermission({ watermark: ['delete'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const id = c.req.param('id')
      const services = c.get('services')
      const { assets, uploads, watermarks } = services
      const record = await assets.find(organizationId, id)
      if (record === null) {
        throw apiErrors.notFound()
      }
      if ((await watermarks.countReferencingAsset(organizationId, id)) > 0) {
        throw apiErrors.conflict()
      }
      const session = c.get('session')
      const isDeleted = await uploads.deleteLogo(organizationId, id, {
        organizationId,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'asset.deleted',
        targetType: 'asset',
        targetId: id,
        metadata: { name: record.name },
      })
      if (!isDeleted) throw apiErrors.conflict()
      await cleanupUploads(services, organizationId)
      return c.body(null, HTTP_STATUS.noContent)
    },
  )
