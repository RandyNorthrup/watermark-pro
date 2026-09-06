import { createMiddleware } from 'hono/factory'

import type { PermissionRequest } from '../../shared/permissions'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'

/**
 * Enforces an organization permission for the organization named by the
 * `orgId` route parameter. Must run after `requireSession`. Membership and
 * role are resolved by Better Auth from the database on every call; a user
 * who is not a member of the organization gets the same 403 as one with an
 * insufficient role, so the response does not reveal organization existence.
 */
export function requirePermission(permissions: PermissionRequest) {
  return createMiddleware<AppContext>(async (c, next) => {
    const organizationId = c.req.param('orgId')
    if (organizationId === undefined || organizationId === '') {
      throw apiErrors.notFound()
    }
    const { auth } = c.get('services')
    let isAllowed: boolean
    try {
      const result = await auth.api.hasPermission({
        headers: c.req.raw.headers,
        body: { organizationId, permissions: toRecord(permissions) },
      })
      isAllowed = result.success
    } catch {
      // Better Auth throws for non-members and expired sessions; both are a 403 here.
      isAllowed = false
    }
    if (!isAllowed) {
      throw apiErrors.forbidden()
    }
    await next()
  })
}

function toRecord(permissions: PermissionRequest): Record<string, string[]> {
  const record: Record<string, string[]> = {}
  for (const [resource, actions] of Object.entries(permissions)) {
    record[resource] = [...actions]
  }
  return record
}
