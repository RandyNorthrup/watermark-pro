/**
 * Wire types and schemas shared by the Worker and the client. The Worker
 * validates responses against these before sending; the client validates
 * responses against them after receiving, so neither side trusts the other
 * blindly.
 */
import { z } from 'zod'

import {
  API_ERROR_CODE,
  APP_ENVIRONMENTS,
  MAX_BULK_DELETE,
  MAX_CURSOR_LENGTH,
  MAX_PHOTO_NAME_LENGTH,
  MAX_PHOTO_SIDE,
  MAX_SHARE_PHOTOS,
  SHARE_EXPIRY_DAYS,
  MAX_PRESET_NAME_LENGTH,
} from './constants'
import { watermarkSpecSchema } from './watermark'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  environment: z.enum(APP_ENVIRONMENTS),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

export const apiErrorSchema = z.object({
  error: z.enum([
    API_ERROR_CODE.notFound,
    API_ERROR_CODE.internalError,
    API_ERROR_CODE.invalidConfiguration,
    API_ERROR_CODE.unauthenticated,
    API_ERROR_CODE.forbidden,
    API_ERROR_CODE.validation,
    API_ERROR_CODE.rateLimited,
    API_ERROR_CODE.conflict,
    API_ERROR_CODE.payloadTooLarge,
    API_ERROR_CODE.unsupportedMedia,
    API_ERROR_CODE.quotaExceeded,
  ]),
  details: z.unknown().optional(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

export const auditEntrySchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
})

export const auditListResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
})

export type AuditListResponse = z.infer<typeof auditListResponseSchema>

const devMailboxMessageSchema = z.object({
  to: z.string(),
  subject: z.string(),
  text: z.string(),
})

export const devMailboxResponseSchema = z.object({
  messages: z.array(devMailboxMessageSchema),
})

export type DevMailboxResponse = z.infer<typeof devMailboxResponseSchema>

export const presetNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the preset a name')
  .max(MAX_PRESET_NAME_LENGTH)

export const saveWatermarkRequestSchema = z.object({
  name: presetNameSchema,
  spec: watermarkSpecSchema,
})

export type SaveWatermarkRequest = z.infer<typeof saveWatermarkRequestSchema>

export const watermarkDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  spec: watermarkSpecSchema,
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type WatermarkDto = z.infer<typeof watermarkDtoSchema>

export const watermarkListResponseSchema = z.object({ watermarks: z.array(watermarkDtoSchema) })

export const assetDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  kind: z.literal('logo'),
  name: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export type AssetDto = z.infer<typeof assetDtoSchema>

export const assetListResponseSchema = z.object({ assets: z.array(assetDtoSchema) })

/** Form fields accompanying an upload; dimensions are client-reported. */
export const assetUploadFieldsSchema = z.object({
  name: z.string().trim().min(1).max(MAX_PRESET_NAME_LENGTH),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
})

export const photoDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  presetId: z.string().nullable(),
  presetName: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export type PhotoDto = z.infer<typeof photoDtoSchema>

export const photoListResponseSchema = z.object({
  photos: z.array(photoDtoSchema),
  nextCursor: z.string().nullable(),
})

/** Query string of the photo list; everything optional but bounded. */
export const photoListQuerySchema = z.object({
  presetId: z.string().min(1).max(MAX_PRESET_NAME_LENGTH).optional(),
  search: z.string().trim().max(MAX_PRESET_NAME_LENGTH).optional(),
  cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
})

/** Form fields accompanying a photo upload; dimensions are client-reported. */
export const photoUploadFieldsSchema = z.object({
  name: z.string().trim().min(1).max(MAX_PHOTO_NAME_LENGTH),
  width: z.coerce.number().int().positive().max(MAX_PHOTO_SIDE),
  height: z.coerce.number().int().positive().max(MAX_PHOTO_SIDE),
  presetId: z.string().min(1).optional(),
})

export const photoDeleteRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_DELETE),
})

export const photoDeleteResponseSchema = z.object({ deleted: z.number().int().nonnegative() })

export const storageUsageSchema = z.object({
  count: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  maxCount: z.number().int().positive(),
  maxBytes: z.number().int().positive(),
})

export const shareCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(MAX_PHOTO_NAME_LENGTH),
  photoIds: z.array(z.string().min(1)).min(1).max(MAX_SHARE_PHOTOS),
  /** Days until the link expires; omitted means never. */
  expiresInDays: z.union(SHARE_EXPIRY_DAYS.map((days) => z.literal(days))).optional(),
})

export type ShareCreateRequest = z.infer<typeof shareCreateRequestSchema>

export const shareDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  title: z.string(),
  photoCount: z.number().int().nonnegative(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Absolute public URL of the link. */
  url: z.url(),
})

export type ShareDto = z.infer<typeof shareDtoSchema>

export const shareListResponseSchema = z.object({ shares: z.array(shareDtoSchema) })

const sharedPhotoSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  contentType: z.string(),
})

/** What a visitor with a valid token can see. */
export const publicShareSchema = z.object({
  title: z.string(),
  expiresAt: z.iso.datetime().nullable(),
  photos: z.array(sharedPhotoSchema),
})

export type PublicShare = z.infer<typeof publicShareSchema>

/** Configuration the browser may know before signing in. */
export const publicConfigSchema = z.object({
  /** Turnstile site key when bot protection is enabled; null otherwise. */
  turnstileSiteKey: z.string().nullable(),
})

export const adminOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  createdAt: z.iso.datetime(),
  memberCount: z.number().int().nonnegative(),
  photoCount: z.number().int().nonnegative(),
  storageBytes: z.number().int().nonnegative(),
})

export const adminOrganizationListSchema = z.object({
  organizations: z.array(adminOrganizationSchema),
})
