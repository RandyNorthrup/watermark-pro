/**
 * Cloudflare Worker entry.
 *
 * Serves the JSON API under `/api`. Static assets and the SPA fallback are
 * handled by Workers Static Assets before this code runs (see
 * `assets.run_worker_first` in wrangler.jsonc), so every request that reaches
 * here is an API request.
 */
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'

import type { AppContext } from './app-context'
import { EnvValidationError } from './env'
import type { ApiError, HealthResponse } from '../shared/api'
import { API_ERROR_CODE, HEALTH_PATH, HSTS_MAX_AGE_SECONDS, HTTP_STATUS } from '../shared/constants'
import { requireSameOrigin } from './middleware/same-origin'
import { auditRoutes } from './routes/audit'
import { devRoutes } from './routes/dev'
import { libraryRoutes } from './routes/library'
import { photoRoutes } from './routes/photos'
import { shareRoutes } from './routes/shares'
import { getServices, type Services } from './services'

export interface CreateAppOptions {
  /** Resolves the service container for a request env. Tests inject fakes here. */
  resolveServices?: (env: Env) => Services
}

/**
 * Builds the Hono application. Exported as a factory so tests can construct
 * isolated instances; the module's default export is the production instance.
 */
export function createApp(options: CreateAppOptions = {}): Hono<AppContext> {
  const resolveServices = options.resolveServices ?? getServices
  const app = new Hono<AppContext>()

  app.use(
    secureHeaders({
      // API responses never render HTML, so the policy can be fully locked
      // down. The SPA's own policy lives in public/_headers because the asset
      // store serves those responses without invoking this Worker.
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
      strictTransportSecurity: `max-age=${String(HSTS_MAX_AGE_SECONDS)}; includeSubDomains`,
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
      },
    }),
  )

  // Rejects state-changing requests whose Origin header does not match the
  // request host. Combined with SameSite cookies this is the CSRF baseline
  // that every later route inherits. Better Auth performs its own origin
  // check on top of this for its endpoints.
  app.use(csrf())

  app.use(async (c, next) => {
    c.set('services', resolveServices(c.env))
    await next()
  })

  app.use(requireSameOrigin)

  app.get(HEALTH_PATH, (c) => {
    const body: HealthResponse = {
      status: 'ok',
      environment: c.get('services').config.APP_ENV,
    }
    return c.json(body, HTTP_STATUS.ok)
  })

  app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    return await c.get('services').auth.handler(c.req.raw)
  })

  app.route('/api', auditRoutes)
  app.route('/api', libraryRoutes)
  app.route('/api', photoRoutes)
  app.route('/api', shareRoutes)
  app.route('/api', devRoutes)

  app.notFound((c) => {
    const body: ApiError = { error: API_ERROR_CODE.notFound }
    return c.json(body, HTTP_STATUS.notFound)
  })

  app.onError((error, c) => {
    // Deliberate HTTP errors raised by middleware (CSRF 403, auth 401/403,
    // validation 400) already carry the right status and body.
    if (error instanceof HTTPException) {
      return error.getResponse()
    }
    if (error instanceof EnvValidationError) {
      console.error(error.message)
      const body: ApiError = { error: API_ERROR_CODE.invalidConfiguration }
      return c.json(body, HTTP_STATUS.internalServerError)
    }
    console.error('Unhandled error while serving', c.req.method, c.req.path, error)
    const body: ApiError = { error: API_ERROR_CODE.internalError }
    return c.json(body, HTTP_STATUS.internalServerError)
  })

  return app
}

const app = createApp()

export default app
