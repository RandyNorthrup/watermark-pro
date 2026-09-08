/**
 * Client error reporting (M19 observability). The browser posts an uncaught
 * error or unhandled rejection here; the Worker stores a bounded, low-PII record
 * (message, single top stack frame, route, request id) for the admin console.
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

  const declaredSize = Number(c.req.header('content-length') ?? '0')
  if (Number.isFinite(declaredSize) && declaredSize > CLIENT_ERROR_MAX_BODY_BYTES) {
    const body: ApiError = { error: API_ERROR_CODE.payloadTooLarge }
    return c.json(body, HTTP_STATUS.payloadTooLarge)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    payload = null
  }
  const parsed = clientErrorReportSchema.safeParse(payload)
  if (!parsed.success) {
    const body: ApiError = { error: API_ERROR_CODE.validation }
    return c.json(body, HTTP_STATUS.badRequest)
  }

  await services.observability.recordClientError({
    message: parsed.data.message,
    source: parsed.data.source ?? null,
    route: parsed.data.route ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    requestId: c.get('requestId'),
    // No user id: reports carry no PII beyond the message, top frame and route.
    userId: null,
  })
  return c.body(null, HTTP_STATUS.noContent)
})
