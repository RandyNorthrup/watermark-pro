import type { z } from 'zod'

import { fetchJson } from './api'
import { captureCloudOwner, notifyCloudConnectionChanged } from './cloud-connection-context'
import { captureOfflineOwner } from './offline-context'
import {
  CLOUD_OAUTH,
  type cloudAccessTokenSchema,
  cloudTokenResponseSchema,
  cloudAttemptStatusSchema,
  cloudCancellationSchema,
  cloudConnectSchema,
  cloudConnectionsSchema,
  cloudDisconnectSchema,
  type CloudProvider,
} from '../../shared/cloud-connections'

const REQUEST = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
} as const
const POLL_MS = 500
const OAUTH_HOSTS = {
  google: 'https://accounts.google.com',
  dropbox: 'https://www.dropbox.com',
  onedrive: 'https://login.microsoftonline.com',
} as const

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const aborted = () => {
      window.clearTimeout(timer)
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new DOMException('Cloud connection cancelled.', 'AbortError'),
      )
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', aborted)
      resolve()
    }, ms)
    signal?.addEventListener('abort', aborted, { once: true })
  })
}

/** Status contains labels and account identities, never tokens. */
export async function cloudConnections(signal?: AbortSignal) {
  return await fetchJson('/api/me/cloud/connections', cloudConnectionsSchema, {
    signal: signal ?? null,
  })
}

/** Server refresh is serialized; another in-flight refresh is retried without opening consent. */
export async function cloudToken(provider: CloudProvider, signal?: AbortSignal) {
  const owner = captureCloudOwner()
  const deadline = Date.now() + CLOUD_OAUTH.refreshLeaseMs + CLOUD_OAUTH.requestTimeoutMs
  while (Date.now() < deadline) {
    owner.assertCurrent()
    const result = await fetchJson(`/api/me/cloud/${provider}/token`, cloudTokenResponseSchema, {
      ...REQUEST,
      signal: signal ?? null,
    })
    owner.assertCurrent()
    if (!('isRefreshing' in result)) return result
    await pause(result.retryAfterMs, signal)
  }
  throw new Error('The cloud provider did not finish refreshing its connection.')
}

/** Explicit Connect owns its popup; success comes only from the account/session-bound server attempt. */
export async function connectCloudProvider(
  provider: CloudProvider,
  signal?: AbortSignal,
): Promise<void> {
  const owner = captureOfflineOwner()
  signal?.throwIfAborted()
  const popup = window.open(
    'about:blank',
    `lumafoil-cloud-${provider}-${crypto.randomUUID()}`,
    'popup,width=600,height=720',
  )
  if (popup === null) throw new Error('Allow popups to connect your cloud account, then try again.')
  let attemptId: string | null = null
  let failure: unknown
  try {
    notifyCloudConnectionChanged()
    const attempt = await fetchJson(`/api/me/cloud/${provider}/connect`, cloudConnectSchema, {
      ...REQUEST,
      signal: signal ?? null,
    })
    attemptId = attempt.id
    const authorization = new URL(attempt.authorizationUrl)
    if (
      authorization.origin !== OAUTH_HOSTS[provider] ||
      authorization.username !== '' ||
      authorization.password !== ''
    )
      throw new Error('Unexpected cloud authorization destination.')
    owner.assertCurrent()
    popup.location.href = authorization.href
    const deadline = Math.min(
      Date.parse(attempt.expiresAt),
      Date.now() + CLOUD_OAUTH.attemptLifetimeMs,
    )
    while (Date.now() < deadline) {
      signal?.throwIfAborted()
      owner.assertCurrent()
      const result = await fetchJson(
        `/api/me/cloud/attempts/${attempt.id}`,
        cloudAttemptStatusSchema,
        { signal: signal ?? null },
      )
      if (result.status === 'connected') {
        owner.assertCurrent()
        signal?.throwIfAborted()
        notifyCloudConnectionChanged()
        return
      }
      if (result.status === 'failed')
        throw new Error('The cloud connection did not complete. Try connecting again.')
      // COOP can sever popup.closed even during a valid provider login. Only
      // the server result, explicit Cancel, or the deadline ends this wait.
      await pause(POLL_MS, signal)
    }
    throw new Error('The cloud connection expired. Try connecting again.')
  } catch (error) {
    failure = error
  } finally {
    try {
      popup.close()
    } catch {
      // Provider COOP may sever the handle; server cancellation still runs.
    }
  }
  if (attemptId !== null) {
    owner.assertCurrent()
    try {
      await fetchJson(`/api/me/cloud/attempts/${attemptId}/cancel`, cloudCancellationSchema, {
        ...REQUEST,
        keepalive: true,
      })
      notifyCloudConnectionChanged()
    } catch {
      throw new Error(
        'Connection cancellation could not be confirmed. Check your cloud connections after reconnecting.',
      )
    }
  }
  throw failure instanceof Error ? failure : new Error('The cloud connection did not complete.')
}

/** Disconnect clears server credentials; providerRevoked reports remote revocation separately. */
export async function disconnectCloudProvider(provider: CloudProvider) {
  const owner = captureOfflineOwner()
  notifyCloudConnectionChanged()
  const result = await fetchJson(
    `/api/me/cloud/${provider}/disconnect`,
    cloudDisconnectSchema,
    REQUEST,
  )
  owner.assertCurrent()
  notifyCloudConnectionChanged()
  return result
}

export type CloudToken = z.infer<typeof cloudAccessTokenSchema>
