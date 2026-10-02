import { Hono } from 'hono'

import {
  workspaceCapacity,
  workspaceCapacityRequestSchema,
  workspaceCapacitySchema,
} from '../../shared/plans'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'
import { requirePermission } from '../middleware/permission'
import { requireSession } from '../middleware/session'

/** Authorized member-visible capacity omits subscription/customer details and private admission state. */
export const workspaceCapacityRoutes = new Hono<AppContext>().get(
  '/orgs/:orgId/capacity',
  requireSession,
  requirePermission({ photo: ['read'] }),
  async (c) => {
    const path = workspaceCapacityRequestSchema.safeParse(c.req.param())
    if (!path.success) throw apiErrors.validation('Workspace identifier is invalid.')
    const record = await c.get('services').plans.get(path.data.orgId)
    return c.json(workspaceCapacitySchema.parse(workspaceCapacity(record)))
  },
)
