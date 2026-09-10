/**
 * Wire types and schemas shared by the Worker and the client. The Worker
 * validates responses against these before sending; the client validates
 * responses against them after receiving, so neither side trusts the other
 * blindly.
 */
import { z } from 'zod'

import {
  APP_ENVIRONMENTS,
  CLIENT_ERROR_MAX_MESSAGE_LENGTH,
  CLIENT_ERROR_MAX_ROUTE_LENGTH,
  CLIENT_ERROR_MAX_SOURCE_LENGTH,
  MAX_BULK_DELETE,
  MAX_CURSOR_LENGTH,
  MAX_PHOTO_NAME_LENGTH,
  MAX_PHOTO_SIDE,
  MAX_SHARE_PHOTOS,
  SHARE_EXPIRY_DAYS,
  MAX_PRESET_NAME_LENGTH,
} from './constants'
import { classifyClientError, redactRoutePath, sanitizeErrorSource } from './observability'

export {
  apiErrorSchema,
  auditEntrySchema,
  auditListResponseSchema,
  publicConfigSchema,
  type ApiError,
  type AuditListResponse,
  type PublicConfig,
} from './api-core'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  environment: z.enum(APP_ENVIRONMENTS),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

const devMailboxMessageSchema = z.object({
  to: z.string(),
  subject: z.string(),
  text: z.string(),
})

export const devMailboxResponseSchema = z.object({
  messages: z.array(devMailboxMessageSchema),
})

export type DevMailboxResponse = z.infer<typeof devMailboxResponseSchema>

/** Body of the console-provider-only `POST /api/dev/promote`. */
export const devPromoteRequestSchema = z.object({
  email: z.email(),
})

export const presetNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the preset a name')
  .max(MAX_PRESET_NAME_LENGTH)

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

/** Normalize again at the server boundary; direct callers cannot store raw diagnostic text. */
export const clientErrorReportSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1)
    .max(CLIENT_ERROR_MAX_MESSAGE_LENGTH)
    .transform(classifyClientError),
  source: z
    .string()
    .trim()
    .max(CLIENT_ERROR_MAX_SOURCE_LENGTH)
    .transform(sanitizeErrorSource)
    .optional(),
  route: z
    .string()
    .trim()
    .startsWith('/')
    .max(CLIENT_ERROR_MAX_ROUTE_LENGTH)
    .transform(redactRoutePath)
    .optional(),
})

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>

export const adminClientErrorSchema = z.object({
  id: z.string(),
  message: z.string(),
  source: z.string().nullable(),
  route: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export const adminClientErrorListSchema = z.object({
  errors: z.array(adminClientErrorSchema),
})

export const adminHealthCheckSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  detail: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
})

export const adminHealthListSchema = z.object({
  checks: z.array(adminHealthCheckSchema),
})
