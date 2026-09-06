import { createMiddleware } from 'hono/factory'

import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'

/** Platform administrators are users whose Better Auth role is `admin`. Must run after `requireSession`. */
export const PLATFORM_ADMIN_ROLE = 'admin'

export const requirePlatformAdmin = createMiddleware<AppContext>(async (c, next) => {
  const { user } = c.get('session')
  if (user.role !== PLATFORM_ADMIN_ROLE) {
    throw apiErrors.forbidden()
  }
  await next()
})
