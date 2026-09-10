/** Per-account recent activity; resource ownership is always rechecked by the server. */
import { z } from 'zod'

import { photoDtoSchema } from './api'
import { watermarkDtoSchema } from './api-watermark'

export const RECENT_WORK_LIMIT = 24
/** Two visible pages keep resource lookups and cleanup bounded. */
export const RECENT_HISTORY_LIMIT = RECENT_WORK_LIMIT * 2
export const RECENT_VIEWS = ['thumbnails', 'list', 'details'] as const
export const recentViewSchema = z.enum(RECENT_VIEWS)
export type RecentView = z.infer<typeof recentViewSchema>
export const DEFAULT_RECENT_VIEW: RecentView = 'thumbnails'
const MAX_RESOURCE_ID_LENGTH = 200
export const MAX_RECENT_CLOCK_SKEW_MS = 300_000

export const recentActivitySchema = z
  .object({
    kind: z.enum(['photo', 'preset']),
    resourceId: z.string().min(1).max(MAX_RESOURCE_ID_LENGTH),
    usedAt: z.iso.datetime(),
  })
  .strict()
export type RecentActivity = z.infer<typeof recentActivitySchema>

export const recentWorkItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('photo'), usedAt: z.iso.datetime(), photo: photoDtoSchema }),
  z.object({ kind: z.literal('preset'), usedAt: z.iso.datetime(), preset: watermarkDtoSchema }),
])
export type RecentWorkItem = z.infer<typeof recentWorkItemSchema>
export type RecentResource =
  | Omit<Extract<RecentWorkItem, { kind: 'photo' }>, 'usedAt'>
  | Omit<Extract<RecentWorkItem, { kind: 'preset' }>, 'usedAt'>
export const recentWorkResponseSchema = z.object({
  items: z.array(recentWorkItemSchema).max(RECENT_WORK_LIMIT),
})
export const recentViewResponseSchema = z.object({ view: recentViewSchema })
export const recentViewRequestSchema = recentViewResponseSchema.strict()
export const localRecentActivitySchema = z.object({
  items: z.array(recentWorkItemSchema).max(RECENT_HISTORY_LIMIT),
})
export const localRecentViewSchema = z.object({ view: recentViewSchema, pending: z.boolean() })

/** Stable resource key for mixed photo/preset lists and local replay. */
export function recentResourceKey(activity: Pick<RecentActivity, 'kind' | 'resourceId'>): string {
  return `${activity.kind}:${activity.resourceId}`
}
