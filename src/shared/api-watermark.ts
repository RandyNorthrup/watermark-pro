/**
 * Wire schemas that carry a full `WatermarkSpec`. Kept out of `api.ts` so that
 * importing the lean, boot-path schemas (session, public config, audit) never
 * pulls in the ~26 kB watermark spec module (PLAN.md §5.5): only the library,
 * designer and editor — all lazily loaded routes — reach these.
 */
import { z } from 'zod'

import { presetNameSchema } from './api'
import { presetVersionSchema } from './sync'
import { watermarkSpecSchema } from './watermark'

export const saveWatermarkRequestSchema = z.object({
  name: presetNameSchema,
  spec: watermarkSpecSchema,
  expectedUpdatedAt: presetVersionSchema.optional(),
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
