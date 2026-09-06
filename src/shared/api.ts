/**
 * Wire types and schemas shared by the Worker and the client. The Worker
 * validates responses against these before sending; the client validates
 * responses against them after receiving, so neither side trusts the other
 * blindly.
 */
import { z } from 'zod'

import { API_ERROR_CODE, APP_ENVIRONMENTS, MAX_PRESET_NAME_LENGTH } from './constants'
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
