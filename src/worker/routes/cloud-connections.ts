import { Hono } from 'hono'

import {
  CLOUD_PROVIDERS,
  cloudAttemptIdSchema,
  cloudTokenResponseSchema,
  cloudCancellationSchema,
  cloudAttemptStatusSchema,
  cloudCallbackSchema,
  cloudConnectSchema,
  cloudConnectionsSchema,
  cloudDisconnectSchema,
  cloudEmptyRequestSchema,
  cloudProviderSchema,
} from '../../shared/cloud-connections'
import type { AppContext } from '../app-context'
import {
  beginCloudConnection,
  cloudAccessToken,
  disconnectCloudConnection,
  finishCloudConnection,
} from '../cloud/connections'
import { cloudProviderConfig } from '../cloud/provider-config'
import { apiErrors } from '../errors'
import { requireSession } from '../middleware/session'

const CONNECT_RETRY_SECONDS = 60

function provider(value: string) {
  const parsed = cloudProviderSchema.safeParse(value)
  if (!parsed.success) throw apiErrors.validation('Unknown cloud provider')
  return parsed.data
}

function attemptId(value: string) {
  const parsed = cloudAttemptIdSchema.safeParse(value)
  if (!parsed.success) throw apiErrors.validation('Invalid cloud connection attempt')
  return parsed.data
}

async function emptyBody(request: Request): Promise<void> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw apiErrors.validation('Invalid cloud connection request')
  }
  if (!cloudEmptyRequestSchema.safeParse(body).success)
    throw apiErrors.validation('Unexpected cloud connection fields')
}

function accessScope(selected: string, dropboxAccess: string) {
  if (selected === 'google') return 'selected_files'
  if (selected === 'dropbox' && dropboxAccess === 'app_folder') return 'app_folder'
  return 'drive'
}

/** No tokens in callback HTML, query redirects, postMessage data, or persistent browser state. */
function callbackPage(isConnected: boolean): Response {
  const title = isConnected ? 'Cloud Account Connected' : 'Cloud Connection Not Completed'
  const message = isConnected
    ? 'Return to Lumafoil. You can close this window.'
    : 'Return to Lumafoil to retry or cancel this connection.'
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Lumafoil</title><h1>${title}</h1><p>${message}</p></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  )
}

export const cloudConnectionRoutes = new Hono<AppContext>()
  .get('/me/cloud/connections', requireSession, async (c) => {
    const services = c.get('services')
    const records = await services.cloud.list(c.get('session').user.id)
    return c.json(
      cloudConnectionsSchema.parse({
        connections: CLOUD_PROVIDERS.map((provider) => {
          const record = records.find((connection) => connection.provider === provider)
          const providerConfig = cloudProviderConfig(services.config, provider)
          return {
            provider,
            status:
              record?.status === 'connected' && record.clientId !== providerConfig?.clientId
                ? 'reconnect'
                : (record?.status ?? 'disconnected'),
            isConfigured: providerConfig !== null,
            accessScope: accessScope(provider, services.config.DROPBOX_ACCESS_TYPE),
            accountLabel: record?.accountLabel ?? null,
            providerAccountId: record?.providerAccountId ?? null,
            generation: record?.generation ?? 0,
          }
        }),
      }),
    )
  })
  .post('/me/cloud/:provider/connect', requireSession, async (c) => {
    await emptyBody(c.req.raw)
    const session = c.get('session')
    const services = c.get('services')
    if (!(await services.importLimiter(`cloud-connect:${session.user.id}`)))
      throw apiErrors.rateLimited(CONNECT_RETRY_SECONDS)
    const selectedProvider = provider(c.req.param('provider'))
    const result = await beginCloudConnection(
      services,
      session.user.id,
      session.session.id,
      selectedProvider,
    )
    return c.json(cloudConnectSchema.parse(result))
  })
  .get('/me/cloud/attempts/:id', requireSession, async (c) => {
    const session = c.get('session')
    const attempt = await c
      .get('services')
      .cloud.attempt(attemptId(c.req.param('id')), session.user.id, session.session.id)
    if (attempt === null) throw apiErrors.notFound()
    return c.json(
      cloudAttemptStatusSchema.parse({
        status: attempt.expiresAt.getTime() <= Date.now() ? 'failed' : attempt.status,
        expiresAt: attempt.expiresAt.toISOString(),
      }),
    )
  })
  .post('/me/cloud/:provider/token', requireSession, async (c) => {
    await emptyBody(c.req.raw)
    const services = c.get('services')
    const userId = c.get('session').user.id
    const selectedProvider = provider(c.req.param('provider'))
    const result = await cloudAccessToken(services, userId, selectedProvider)
    return c.json(cloudTokenResponseSchema.parse(result))
  })
  .post('/me/cloud/attempts/:id/cancel', requireSession, async (c) => {
    await emptyBody(c.req.raw)
    const session = c.get('session')
    const isCancelled = await c
      .get('services')
      .cloud.cancelAttempt(
        attemptId(c.req.param('id')),
        session.user.id,
        session.session.id,
        new Date(),
      )
    if (!isCancelled) throw apiErrors.notFound()
    return c.json(cloudCancellationSchema.parse({ cancelled: true }))
  })
  .post('/me/cloud/:provider/disconnect', requireSession, async (c) => {
    await emptyBody(c.req.raw)
    const { providerRevoked } = await disconnectCloudConnection(
      c.get('services'),
      c.get('session').user.id,
      provider(c.req.param('provider')),
    )
    return c.json(cloudDisconnectSchema.parse({ disconnected: true, providerRevoked }))
  })
  .get('/cloud/:provider/callback', requireSession, async (c) => {
    const parsed = cloudCallbackSchema.safeParse(c.req.query())
    if (!parsed.success) throw apiErrors.validation('Invalid cloud authorization callback')
    const session = c.get('session')
    const services = c.get('services')
    const selectedProvider = provider(c.req.param('provider'))
    const { isConnected, failure } = await finishCloudConnection(
      services,
      session.user.id,
      session.session.id,
      selectedProvider,
      parsed.data,
    )
    if (failure !== null) {
      // Finite internal classifications support private diagnostics without
      // persisting callback URLs, provider messages, codes or personal claims.
      await services.audit.append({
        actorUserId: session.user.id,
        action: 'cloud.connection_failed',
        targetType: 'cloud_connection',
        metadata: { provider: selectedProvider, ...failure },
      })
    }
    return callbackPage(isConnected)
  })
