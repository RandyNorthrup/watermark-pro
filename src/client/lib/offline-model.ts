/** Validated IndexedDB records. Blobs stay as structured data, never JSON strings. */
import { z } from 'zod'

import { assetDtoSchema, photoDtoSchema } from '../../shared/api'
import { saveWatermarkRequestSchema, watermarkDtoSchema } from '../../shared/api-watermark'
import { syncOperationIdSchema } from '../../shared/sync'

const blobSchema = z.instanceof(Blob)
const presetCreateSchema = z.object({
  kind: z.literal('preset-create'),
  preset: watermarkDtoSchema,
})
const presetUpdateSchema = z.object({
  kind: z.literal('preset-update'),
  preset: watermarkDtoSchema,
  body: saveWatermarkRequestSchema,
})
const presetDeleteSchema = z.object({ kind: z.literal('preset-delete'), presetId: z.string() })
const photoUploadSchema = z.object({
  kind: z.literal('photo-upload'),
  photo: photoDtoSchema,
  blob: blobSchema,
  thumbnail: blobSchema,
})
const photoDeleteSchema = z.object({
  kind: z.literal('photo-delete'),
  photoIds: z.array(z.string()),
})
const logoUploadSchema = z.object({
  kind: z.literal('logo-upload'),
  asset: assetDtoSchema,
  blob: blobSchema,
})
const logoDeleteSchema = z.object({ kind: z.literal('logo-delete'), assetId: z.string() })

export const offlineChangeSchema = z.discriminatedUnion('kind', [
  presetCreateSchema,
  presetUpdateSchema,
  presetDeleteSchema,
  photoUploadSchema,
  photoDeleteSchema,
  logoUploadSchema,
  logoDeleteSchema,
])
export type OfflineChange = z.infer<typeof offlineChangeSchema>

export const pendingOperationSchema = z.object({
  sequence: z.number().int().positive(),
  id: syncOperationIdSchema,
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  change: offlineChangeSchema,
  state: z.enum(['pending', 'blocked', 'conflict', 'synced']),
  error: z.string().nullable(),
})
export type PendingOperation = z.infer<typeof pendingOperationSchema>
export type NewOperation = Omit<PendingOperation, 'sequence'>

export const cachedRecordSchema = z.object({
  key: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  value: z.unknown(),
})
export type CachedRecord = z.infer<typeof cachedRecordSchema>
