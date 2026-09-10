import { Hono } from 'hono'

import { HTTP_STATUS } from '../../shared/constants'
import {
  DEFAULT_RECENT_VIEW,
  MAX_RECENT_CLOCK_SKEW_MS,
  RECENT_WORK_LIMIT,
  recentActivitySchema,
  recentViewRequestSchema,
  recentViewResponseSchema,
  recentWorkResponseSchema,
  type RecentWorkItem,
} from '../../shared/recent-work'
import type { AppContext } from '../app-context'
import { photoToDto, watermarkToDto } from '../dto'
import { apiErrors } from '../errors'
import { requirePermission } from '../middleware/permission'
import { requireSession } from '../middleware/session'

const readWorkspacePermission = requirePermission({ photo: ['read'], watermark: ['read'] })

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw apiErrors.validation('Invalid recent-work JSON body')
  }
}

export const recentWorkRoutes = new Hono<AppContext>()
  .get('/me/recent-view', requireSession, async (c) => {
    const view = await c.get('services').recents.view(c.get('session').user.id)
    return c.json(recentViewResponseSchema.parse({ view: view ?? DEFAULT_RECENT_VIEW }))
  })
  .patch('/me/recent-view', requireSession, async (c) => {
    const parsed = recentViewRequestSchema.safeParse(await readBody(c.req.raw))
    if (!parsed.success) throw apiErrors.validation(parsed.error.issues)
    await c.get('services').recents.setView(c.get('session').user.id, parsed.data.view)
    return c.json(parsed.data)
  })
  .get('/orgs/:orgId/recent-work', requireSession, readWorkspacePermission, async (c) => {
    const { recents, photos, watermarks } = c.get('services')
    const userId = c.get('session').user.id
    const organizationId = c.req.param('orgId')
    const history = await recents.list(userId, organizationId)
    const [photoRecords, presetRecords] = await Promise.all([
      photos.findMany(
        organizationId,
        history.filter((item) => item.kind === 'photo').map((item) => item.resourceId),
      ),
      watermarks.findMany(
        organizationId,
        history.filter((item) => item.kind === 'preset').map((item) => item.resourceId),
      ),
    ])
    const photoById = new Map(photoRecords.map((record) => [record.id, record]))
    const presetById = new Map(presetRecords.map((record) => [record.id, record]))
    const missing = []
    const items: RecentWorkItem[] = []
    for (const activity of history) {
      const usedAt = activity.usedAt.toISOString()
      if (activity.kind === 'photo') {
        const photo = photoById.get(activity.resourceId)
        if (photo !== undefined) {
          items.push({ kind: 'photo', usedAt, photo: photoToDto(photo) })
          continue
        }
      } else {
        const preset = presetById.get(activity.resourceId)
        if (preset !== undefined) {
          items.push({ kind: 'preset', usedAt, preset: watermarkToDto(preset) })
          continue
        }
      }
      // Deleted resources never reveal stale names/previews, even when an old
      // activity row remains after an interrupted cleanup.
      missing.push(activity)
    }
    await recents.removeMany(userId, organizationId, missing)
    return c.json(recentWorkResponseSchema.parse({ items: items.slice(0, RECENT_WORK_LIMIT) }))
  })
  .post('/orgs/:orgId/recent-work', requireSession, readWorkspacePermission, async (c) => {
    const parsed = recentActivitySchema.safeParse(await readBody(c.req.raw))
    if (!parsed.success) throw apiErrors.validation(parsed.error.issues)
    const usedAt = new Date(parsed.data.usedAt)
    if (usedAt.getTime() < 0 || usedAt.getTime() > Date.now() + MAX_RECENT_CLOCK_SKEW_MS)
      throw apiErrors.validation('Invalid recent activity timestamp')
    const { recents, photos, watermarks } = c.get('services')
    const organizationId = c.req.param('orgId')
    const record =
      parsed.data.kind === 'photo'
        ? await photos.find(organizationId, parsed.data.resourceId)
        : await watermarks.find(organizationId, parsed.data.resourceId)
    if (record === null) throw apiErrors.notFound()
    await recents.record({
      userId: c.get('session').user.id,
      organizationId,
      kind: parsed.data.kind,
      resourceId: parsed.data.resourceId,
      usedAt,
    })
    return c.body(null, HTTP_STATUS.noContent)
  })
