import { Hono } from 'hono'

import type { AuditListResponse } from '../../shared/api'
import { HTTP_STATUS } from '../../shared/constants'
import type { AppContext } from '../app-context'
import { requirePermission } from '../middleware/permission'
import { requireSession } from '../middleware/session'

/** Read access to an organization's audit trail; requires `audit:read`. */
export const auditRoutes = new Hono<AppContext>().get(
  '/orgs/:orgId/audit',
  requireSession,
  requirePermission({ audit: ['read'] }),
  async (c) => {
    const organizationId = c.req.param('orgId')
    const records = await c.get('services').audit.listForOrganization(organizationId)
    const body: AuditListResponse = {
      entries: records.map((record) => ({
        id: record.id,
        organizationId: record.organizationId ?? null,
        actorUserId: record.actorUserId ?? null,
        actorName: record.actorName ?? null,
        action: record.action,
        targetType: record.targetType,
        targetId: record.targetId ?? null,
        metadata: record.metadata ?? null,
        createdAt: record.createdAt.toISOString(),
      })),
    }
    return c.json(body, HTTP_STATUS.ok)
  },
)
