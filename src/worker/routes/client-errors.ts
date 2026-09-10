/**
 * Client error reporting (M19 observability). The browser posts an uncaught
 * error or unhandled rejection here; the Worker stores only a fixed error class,
 * own-asset coordinates, a known route shape and request id for the admin console.
 * Rate limited per client so a render loop cannot flood the table, and capped in
 * size. No authentication: errors happen on public pages too.
 */
import { Hono } from 'hono'

import { type ApiError, clientErrorReportSchema } from '../../shared/api'
import {
  API_ERROR_CODE,
  API_RATE_LIMIT,
  CLIENT_ERROR_MAX_BODY_BYTES,
  HTTP_STATUS,
} from '../../shared/constants'
import type { AppContext } from '../app-context'
import { readJsonBody } from '../request-body'

export const clientErrorRoutes = new Hono<AppContext>().post('/client-errors', async (c) => {
  const services = c.get('services')
  const address = c.req.header('cf-connecting-ip') ?? 'unknown'
  const { allowed } = await services.rateLimit.consume(`client-error:${address}`, {
    window: API_RATE_LIMIT.windowSeconds,
    max: API_RATE_LIMIT.max,
  })
  if (!allowed) {
    const body: ApiError = { error: API_ERROR_CODE.rateLimited }
    return c.json(body, HTTP_STATUS.tooManyRequests)
  }

  const payload = await readJsonBody(c.req.raw, CLIENT_ERROR_MAX_BODY_BYTES)
  const parsed = clientErrorReportSchema.safeParse(payload)
  if (!parsed.success) {
    const body: ApiError = { error: API_ERROR_CODE.validation }
    return c.json(body, HTTP_STATUS.badRequest)
  }

  await services.observability.recordClientError({
    message: parsed.data.message,
    source: parsed.data.source ?? null,
    route: parsed.data.route ?? null,
    userAgent: null,
    requestId: c.get('requestId'),
    // Diagnostics are not a second account/profile inventory.
    userId: null,
  })
  return c.body(null, HTTP_STATUS.noContent)
})
