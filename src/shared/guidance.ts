import { z } from 'zod'

/** Stable identifiers: a release must never rename a topic to revive an old tip. */
export const GUIDANCE_TOPICS = [
  'tour',
  'image',
  'watermark',
  'presets',
  'crop',
  'adjust',
  'resize',
  'export',
  'library',
  'gallery',
  'bulk',
  'documents',
  'video',
  'workspace',
] as const
export const guidanceTopicSchema = z.enum(GUIDANCE_TOPICS)
export type GuidanceTopic = z.infer<typeof guidanceTopicSchema>
export const guidanceClaimSchema = z.object({ topic: guidanceTopicSchema }).strict()
export const guidanceClaimResponseSchema = z.object({ claimed: z.boolean() }).strict()
