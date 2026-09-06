import { createMiddleware } from 'hono/factory'

import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'

/** Rejects unauthenticated requests with a JSON 401 and exposes the session to handlers. */
export const requireSession = createMiddleware<AppContext>(async (c, next) => {
  const session = await c.get('services').auth.api.getSession({ headers: c.req.raw.headers })
  if (session === null) {
    throw apiErrors.unauthenticated()
  }
  c.set('session', session)
  await next()
})
