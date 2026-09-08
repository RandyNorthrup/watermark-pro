/**
 * Platform administration (PLAN.md M8). User management is handled by
 * Better Auth's admin plugin under /api/auth/admin/*; these routes add what
 * it lacks: a cross-organization view of tenants and the global audit trail.
 * Only users with the platform `admin` role may call them.
 */
import { Hono } from 'hono'

import {
  adminClientErrorListSchema,
  adminHealthListSchema,
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
      publicConfigSchema.parse({
        turnstileSiteKey: config.TURNSTILE_SITE_KEY ?? null,
        googleOAuthClientId: config.GOOGLE_OAUTH_CLIENT_ID ?? null,
        googlePickerApiKey: config.GOOGLE_PICKER_API_KEY ?? null,
        googlePickerAppId: config.GOOGLE_PICKER_APP_ID ?? null,
        microsoftClientId: config.MICROSOFT_CLIENT_ID ?? null,
        dropboxAppKey: config.DROPBOX_APP_KEY ?? null,
      }),
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
  .get('/admin/client-errors', requireSession, requirePlatformAdmin, async (c) => {
    const errors = await c.get('services').observability.listClientErrors()
    return c.json(
      adminClientErrorListSchema.parse({
        errors: errors.map((error) => ({
          id: error.id,
          message: error.message,
          source: error.source,
          route: error.route,
          userAgent: error.userAgent,
          requestId: error.requestId,
          userId: error.userId,
          createdAt: error.createdAt.toISOString(),
        })),
      }),
      HTTP_STATUS.ok,
    )
  })
  .get('/admin/health', requireSession, requirePlatformAdmin, async (c) => {
    const checks = await c.get('services').observability.listHealthChecks()
    return c.json(
      adminHealthListSchema.parse({
        checks: checks.map((check) => ({
          id: check.id,
          ok: check.ok,
          detail: check.detail,
          durationMs: check.durationMs,
          createdAt: check.createdAt.toISOString(),
        })),
      }),
      HTTP_STATUS.ok,
    )
  })
