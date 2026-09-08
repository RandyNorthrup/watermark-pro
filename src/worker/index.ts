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
import {
  API_ERROR_CODE,
  AUTH_SIGN_OUT_PATH,
  CLEAR_SITE_DATA_ON_SIGN_OUT,
  HEALTH_PATH,
  HSTS_MAX_AGE_SECONDS,
  HTTP_STATUS,
} from '../shared/constants'
import { requireSameOrigin } from './middleware/same-origin'
import { adminRoutes } from './routes/admin'
import { auditRoutes } from './routes/audit'
import { clientErrorRoutes } from './routes/client-errors'
import { devRoutes } from './routes/dev'
import { importRoutes } from './routes/imports'
import { serveLanding } from './routes/landing'
import { libraryRoutes } from './routes/library'
import { meRoutes } from './routes/me'
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

  // A correlation id for every request: taken from an inbound X-Request-Id when
  // present (so a value assigned upstream is preserved), otherwise generated.
  // Echoed on the response and included in error logs so a report from the
  // client (POST /api/client-errors) can be tied to a Worker log line.
  app.use(async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? crypto.randomUUID()
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    await next()
  })

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
    const response = await c.get('services').auth.handler(c.req.raw)
    // On sign-out, tell the browser to drop the offline caches and local
    // storage so a shared device does not keep the previous user's cached shell
    // or persisted query data (M19). Better Auth already clears the cookie.
    if (c.req.path === AUTH_SIGN_OUT_PATH && response.ok) {
      const headers = new Headers(response.headers)
      headers.set('Clear-Site-Data', CLEAR_SITE_DATA_ON_SIGN_OUT)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return response
  })

  app.route('/api', auditRoutes)
  app.route('/api', clientErrorRoutes)
  app.route('/api', libraryRoutes)
  app.route('/api', importRoutes)
  app.route('/api', meRoutes)
  app.route('/api', photoRoutes)
  app.route('/api', shareRoutes)
  app.route('/api', adminRoutes)
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
    console.error(
      'Unhandled error while serving',
      c.get('requestId'),
      c.req.method,
      c.req.path,
      error,
    )
    const body: ApiError = { error: API_ERROR_CODE.internalError }
    return c.json(body, HTTP_STATUS.internalServerError)
  })

  return app
}

const app = createApp()

/**
 * Scheduled health check (M19 observability, wrangler `triggers.crons`). Confirms
 * the database is reachable with one D1 read, times it, and records the outcome
 * so the admin console can show recent uptime without any dashboard. Never
 * throws: a failure is recorded and logged, not propagated. Exported so the
 * Workers test can await it directly (the cron wrapper only schedules it).
 */
export async function runHealthCheck(env: Env): Promise<void> {
  const services = getServices(env)
  const started = Date.now()
  let isHealthy = true
  let detail: string | null = null
  try {
    await services.observability.listHealthChecks()
  } catch (error) {
    isHealthy = false
    detail = error instanceof Error ? error.message : String(error)
  }
  const durationMs = Date.now() - started
  try {
    await services.observability.recordHealthCheck({ ok: isHealthy, detail, durationMs })
  } catch (error) {
    console.error('health check: could not record the result', error)
  }
  if (!isHealthy) {
    console.error('health check failed', detail)
  }
}

/**
 * The Worker serves the front door (GET /) as a prerendered, per-locale static
 * landing before the API app runs (src/worker/routes/landing.ts). Everything
 * else — the JSON API — is the Hono app. `run_worker_first` in wrangler.jsonc
 * routes `/api/*` and `/` here; all other paths are served from the asset store
 * without invoking this Worker. The cron trigger runs the health check.
 */
export default {
  async fetch(request, env, ctx) {
    const landing = await serveLanding(request, env)
    return landing ?? (await app.fetch(request, env, ctx))
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(runHealthCheck(env))
  },
} satisfies ExportedHandler<Env>
