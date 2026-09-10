import { createMiddleware } from 'hono/factory'

import type { AppContext } from '../app-context'
import { hasSiteManagementAccess } from '../auth/site-administrator'
import { apiErrors } from '../errors'

/** Site managers never gain access to another user's private workspace. Requires a live session. */
export const requirePlatformAdmin = createMiddleware<AppContext>(async (c, next) => {
  const { user } = c.get('session')
  const ownerId = await c.get('services').accounts.siteOwnerId()
  if (!hasSiteManagementAccess(user, ownerId)) {
    throw apiErrors.forbidden()
  }
  await next()
})
