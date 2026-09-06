import { createMiddleware } from 'hono/factory'

import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Cross-site request forgery guard for the whole API. Authentication is
 * cookie-based and the only legitimate caller is the SPA on the same origin,
 * so every state-changing request must carry an `Origin` header equal to the
 * configured app origin. Browsers always send `Origin` on cross-origin and
 * same-origin POSTs; a request without one is treated as foreign.
 *
 * Hono's `csrf()` only inspects form content types (the classic CSRF vector)
 * and Better Auth only checks origins on requests that carry redirect URLs,
 * so this closes the remaining gap for JSON and text bodies.
 */
export const requireSameOrigin = createMiddleware<AppContext>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    await next()
    return
  }
  const origin = c.req.header('origin')
  const expected = new URL(c.get('services').config.APP_URL).origin
  if (origin !== expected) {
    throw apiErrors.forbidden()
  }
  await next()
})
