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

import { EnvValidationError, type ValidatedEnv, validateEnv } from './env'
import type { ApiError, HealthResponse } from '../shared/api'
import { API_ERROR_CODE, HEALTH_PATH, HSTS_MAX_AGE_SECONDS, HTTP_STATUS } from '../shared/constants'

interface AppContext {
  Bindings: Env
  Variables: {
    config: ValidatedEnv
  }
}

/**
 * Builds the Hono application. Exported as a factory so tests can construct
 * isolated instances; the module's default export is the production instance.
 */
export function createApp(): Hono<AppContext> {
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
  // that every later route inherits.
  app.use(csrf())

  app.use(async (c, next) => {
    c.set('config', validateEnv(c.env))
    await next()
  })

  app.get(HEALTH_PATH, (c) => {
    const body: HealthResponse = {
      status: 'ok',
      environment: c.get('config').APP_ENV,
    }
    return c.json(body, HTTP_STATUS.ok)
  })

  app.notFound((c) => {
    const body: ApiError = { error: API_ERROR_CODE.notFound }
    return c.json(body, HTTP_STATUS.notFound)
  })

  app.onError((error, c) => {
    // Deliberate HTTP errors raised by middleware (CSRF 403, body limits,
    // future auth 401s) already carry the right status and body.
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
