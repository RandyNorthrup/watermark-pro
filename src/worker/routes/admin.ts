/**
 * Platform administration (PLAN.md M8). User management is handled by
 * Better Auth's admin plugin under /api/auth/admin/*; these routes add what
 * it lacks: a cross-organization view of tenants and the global audit trail.
 * Only users with the platform `admin` role may call them.
 */
import { Hono } from 'hono'

import {
  adminOrganizationListSchema,
  auditListResponseSchema,
  publicConfigSchema,
} from '../../shared/api'
import { HTTP_STATUS } from '../../shared/constants'
import type { AppContext } from '../app-context'
import { auditToDto } from '../dto'
import { requirePlatformAdmin } from '../middleware/platform-admin'
import { requireSession } from '../middleware/session'

export const adminRoutes = new Hono<AppContext>()
  .get('/config', (c) => {
    const { config } = c.get('services')
    return c.json(
      publicConfigSchema.parse({ turnstileSiteKey: config.TURNSTILE_SITE_KEY ?? null }),
      HTTP_STATUS.ok,
    )
  })
  .get('/admin/organizations', requireSession, requirePlatformAdmin, async (c) => {
    const { organizations, photos } = c.get('services')
    const [summaries, usage] = await Promise.all([
      organizations.listSummaries(),
      photos.usageByOrganization(),
    ])
    return c.json(
      adminOrganizationListSchema.parse({
        organizations: summaries.map((organization) => ({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          createdAt: organization.createdAt.toISOString(),
          memberCount: organization.memberCount,
          photoCount: usage.get(organization.id)?.count ?? 0,
          storageBytes: usage.get(organization.id)?.bytes ?? 0,
        })),
      }),
      HTTP_STATUS.ok,
    )
  })
  .get('/admin/audit', requireSession, requirePlatformAdmin, async (c) => {
    const records = await c.get('services').audit.listAll()
    return c.json(
      auditListResponseSchema.parse({ entries: records.map((record) => auditToDto(record)) }),
      HTTP_STATUS.ok,
    )
  })
