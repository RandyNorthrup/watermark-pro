import { afterEach, describe, expect, it, vi } from 'vitest'

import { cloudDigest } from './crypto'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import {
  cloudAccessTokenSchema,
  cloudAttemptStatusSchema,
  cloudConnectSchema,
  cloudConnectionsSchema,
} from '../../shared/cloud-connections'
import { shellSessionSchema } from '../../shared/shell-cache'
import { TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness, type TestHarnessOptions } from '../test-support/test-app'

const PERSON = {
  name: 'Cloud Fixture',
  email: 'cloud@example.test',
  password: 'correct horse battery',
}
const CONFIG = {
  CLOUD_TOKEN_SECRET: 'fixture-cloud-key-more-than-32-characters',
  GOOGLE_OAUTH_CLIENT_ID: 'fixture-google-client',
  GOOGLE_CLOUD_CLIENT_SECRET: 'fixture-google-secret',
}

afterEach(() => vi.unstubAllGlobals())

async function actor(configuration: TestHarnessOptions['cloudConnections'] = {}) {
  const harness = createTestHarness({ cloudConnections: { ...CONFIG, ...configuration } })
  const client = new TestClient(harness.app, harness.env)
  await client.signUpAndVerify(harness.mailbox, PERSON)
  const session = shellSessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
  return { harness, client, userId: session.user.id }
}

function formBody(init?: RequestInit): URLSearchParams {
  if (!(init?.body instanceof URLSearchParams)) throw new Error('Expected an OAuth form body')
  return init.body
}

async function authorize(client: TestClient) {
  const started = cloudConnectSchema.parse(
    await responseJson(client.post('/api/me/cloud/google/connect', {})),
  )
  const state = new URL(started.authorizationUrl).searchParams.get('state')
  if (state === null) throw new Error('Expected state')
  const callback = `/api/cloud/google/callback?state=${state}&code=allowed`
  expect(await responseStatus(client.get(callback))).toBe(200)
  return { ...started, callback }
}

it.each(['exchange', 'identity'] as const)(
  'records only a bounded %s failure for an authenticated one-use callback',
  async (stage) => {
    const { harness, client, userId } = await actor()
    const fetcher = vi.fn<typeof fetch>()
    if (stage === 'exchange') {
      fetcher.mockResolvedValueOnce(
        Response.json(
          { error: 'invalid_grant', error_description: 'PRIVATE_PROVIDER_CANARY' },
          { status: 400 },
        ),
      )
    } else {
      fetcher.mockResolvedValueOnce(
        Response.json({
          access_token: 'PRIVATE_ACCESS_CANARY',
          refresh_token: 'PRIVATE_REFRESH_CANARY',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      fetcher.mockResolvedValueOnce(Response.json({ user: { private: 'PRIVATE_IDENTITY_CANARY' } }))
    }
    vi.stubGlobal('fetch', fetcher)
    const started = await authorize(client)
    const failures = harness.audit.records.filter(
      (record) => record.action === 'cloud.connection_failed',
    )
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      actorUserId: userId,
      targetType: 'cloud_connection',
      metadata:
        stage === 'exchange'
          ? { provider: 'google', stage, reason: 'provider_refused', httpStatus: 400 }
          : { provider: 'google', stage, reason: 'invalid_data' },
    })
    expect(
      Object.keys(failures[0]?.metadata ?? {}).toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(
      stage === 'exchange'
        ? ['httpStatus', 'provider', 'reason', 'stage']
        : ['provider', 'reason', 'stage'],
    )
    expect(JSON.stringify(failures)).not.toContain('PRIVATE_')
    expect(JSON.stringify(failures)).not.toContain(started.authorizationUrl)
    expect(await responseStatus(client.get(started.callback))).toBe(403)
    expect(
      harness.audit.records.filter((record) => record.action === 'cloud.connection_failed'),
    ).toHaveLength(1)
  },
)

async function expire(context: Awaited<ReturnType<typeof actor>>) {
  const record = await context.harness.services.cloud.find(context.userId, 'google')
  if (record === null) throw new Error('Expected connection')
  const now = new Date()
  const lease = 'fixture-expiry-lease'
  const leaseExpiresAt = new Date(now.getTime() + 1000)
  expect(
    await context.harness.services.cloud.leaseRefresh(
      context.userId,
      'google',
      record.generation,
      lease,
      now,
      leaseExpiresAt,
    ),
  ).toBe(true)
  expect(
    await context.harness.services.cloud.finishRefresh(
      context.userId,
      'google',
      record.generation,
      lease,
      { ...record, accessExpiresAt: new Date(0) },
      now,
    ),
  ).toBe(true)
}

function providerReplies() {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url === 'https://oauth2.googleapis.com/token') {
      const form = formBody(init)
      return Promise.resolve(
        Response.json({
          access_token: form.has('refresh_token') ? 'refreshed-access' : 'first-access',
          refresh_token: 'durable-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/drive.file',
        }),
      )
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/about?'))
      return Promise.resolve(
        Response.json({
          user: {
            permissionId: 'google-cloud-owner',
            displayName: 'Cloud Owner',
            emailAddress: 'cloud-owner@example.test',
          },
        }),
      )
    if (url === 'https://oauth2.googleapis.com/revoke')
      return Promise.resolve(new Response(null, { status: 200 }))
    throw new Error('Unexpected provider endpoint')
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('durable cloud connections through authenticated API', () => {
  it('validates attempt identifiers and request bodies without creating a connection', async () => {
    const { client, harness, userId } = await actor()
    expect(await responseStatus(client.get('/api/me/cloud/attempts/invalid'))).toBe(400)
    expect(await responseStatus(client.post('/api/me/cloud/attempts/invalid/cancel', {}))).toBe(400)
    const unknown = crypto.randomUUID()
    expect(await responseStatus(client.get(`/api/me/cloud/attempts/${unknown}`))).toBe(404)
    expect(await responseStatus(client.post(`/api/me/cloud/attempts/${unknown}/cancel`, {}))).toBe(
      404,
    )
    const malformed = await client.request('/api/me/cloud/google/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    expect(malformed.status).toBe(400)
    expect(await harness.services.cloud.find(userId, 'google')).toBeNull()
  })

  it('makes local disconnect idempotent even when no provider grant is present', async () => {
    const { client } = await actor()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    for (const provider of ['onedrive', 'dropbox', 'google', 'google']) {
      const result = await responseJson(client.post(`/api/me/cloud/${provider}/disconnect`, {}))
      expect(result).toEqual({ disconnected: true, providerRevoked: false })
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('consumes denied consent once and returns no provider code or details in callback HTML', async () => {
    const { client, harness, userId } = await actor()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const start = cloudConnectSchema.parse(
      await responseJson(client.post('/api/me/cloud/google/connect', {})),
    )
    const state = new URL(start.authorizationUrl).searchParams.get('state')
    const callback = `/api/cloud/google/callback?state=${state ?? ''}&error=access_denied&error_description=PRIVATE_PROVIDER_DETAILS`
    const response = await client.get(callback)
    expect(response.status).toBe(200)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    const html = await response.text()
    expect(html).toContain('Cloud Connection Not Completed')
    expect(html).not.toContain('PRIVATE_PROVIDER_DETAILS')
    const stored = await harness.services.cloud.find(userId, 'google')
    expect(stored?.refreshCipher).toBeNull()
    expect(await responseStatus(client.get(callback))).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails a provider exchange without retaining credentials or reflecting its private error', async () => {
    const { client, harness, userId } = await actor()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('PRIVATE_EXCHANGE_FAILURE')))
    const started = await authorize(client)
    const status = cloudAttemptStatusSchema.parse(
      await responseJson(client.get(`/api/me/cloud/attempts/${started.id}`)),
    )
    expect(status.status).toBe('failed')
    const stored = await harness.services.cloud.find(userId, 'google')
    expect(stored?.refreshCipher).toBeNull()
    expect(await responseStatus(client.post('/api/me/cloud/google/token', {}))).toBe(409)
  })

  it.each(['refused', 'unavailable', 'redirected', 'accepted'] as const)(
    'clears Dropbox access and accurately reports remote revocation when %s',
    async (failure) => {
      const { client, harness, userId } = await actor({
        DROPBOX_APP_KEY: 'fixture-dropbox-app',
        DROPBOX_APP_SECRET: 'fixture-dropbox-secret',
      })
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({
            access_token: 'dropbox-access',
            refresh_token: 'dropbox-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            account_id: 'dropbox-owner',
            email: 'dropbox@example.test',
            name: { display_name: 'Cloud Owner' },
          }),
        )
      switch (failure) {
        case 'refused': {
          fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }))
          break
        }
        case 'redirected': {
          fetcher.mockResolvedValueOnce(
            new Response(null, {
              status: 307,
              headers: { location: 'https://attacker.test/token' },
            }),
          )
          break
        }
        case 'accepted': {
          fetcher.mockResolvedValueOnce(new Response(null, { status: 200 }))
          break
        }
        default: {
          fetcher.mockRejectedValueOnce(new TypeError('Offline'))
        }
      }
      vi.stubGlobal('fetch', fetcher)
      const start = cloudConnectSchema.parse(
        await responseJson(client.post('/api/me/cloud/dropbox/connect', {})),
      )
      const state = new URL(start.authorizationUrl).searchParams.get('state')
      expect(
        await responseStatus(
          client.get(`/api/cloud/dropbox/callback?state=${state ?? ''}&code=allowed`),
        ),
      ).toBe(200)
      const connected = await harness.services.cloud.find(userId, 'dropbox')
      expect(connected?.status).toBe('connected')
      expect(await responseJson(client.post('/api/me/cloud/dropbox/disconnect', {}))).toEqual({
        disconnected: true,
        providerRevoked: failure === 'accepted',
      })
      expect(fetcher.mock.calls[2]?.[0]).toBe('https://api.dropboxapi.com/2/auth/token/revoke')
      expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
        headers: { Authorization: 'Bearer dropbox-access' },
        redirect: 'manual',
      })
      expect(fetcher).toHaveBeenCalledTimes(3)
      const disconnected = await harness.services.cloud.find(userId, 'dropbox')
      expect(disconnected?.status).toBe('disconnected')
      expect(disconnected?.refreshCipher).toBeNull()
      expect(await responseStatus(client.post('/api/me/cloud/dropbox/token', {}))).toBe(409)
    },
  )

  it('binds one-use state and PKCE to the exact session, then reuses encrypted credentials across requests', async () => {
    const { harness, client, userId } = await actor()
    const fetch = providerReplies()
    const began = cloudConnectSchema.parse(
      await responseJson(client.post('/api/me/cloud/google/connect', {})),
    )
    const authorization = new URL(began.authorizationUrl)
    expect(authorization.searchParams.get('access_type')).toBe('offline')
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5273/api/cloud/google/callback',
    )
    const state = authorization.searchParams.get('state')
    if (state === null) throw new Error('Expected OAuth state')
    const secondSession = new TestClient(harness.app, harness.env)
    await secondSession.post('/api/auth/sign-in/email', {
      email: PERSON.email,
      password: PERSON.password,
    })
    const callback = `/api/cloud/google/callback?state=${state}&code=one-use-code`
    expect(await responseStatus(secondSession.get(callback))).toBe(403)
    expect(
      await responseStatus(client.get('/api/cloud/google/callback?state=forged&code=one-use-code')),
    ).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
    expect(await responseStatus(client.get(callback))).toBe(200)
    expect(await responseStatus(client.get(callback))).toBe(403)
    expect(
      harness.audit.records.some((record) => record.action === 'cloud.connection_failed'),
    ).toBe(false)
    const exchange = fetch.mock.calls.find(([url]) => url === 'https://oauth2.googleapis.com/token')
    const form = formBody(exchange?.[1])
    expect(await cloudDigest(form.get('code_verifier') ?? '')).toBe(
      authorization.searchParams.get('code_challenge'),
    )
    expect(form.get('client_secret')).toBe(CONFIG.GOOGLE_CLOUD_CLIENT_SECRET)
    const record = await harness.services.cloud.find(userId, 'google')
    expect(JSON.stringify(record)).not.toContain('durable-refresh')
    expect(record?.providerAccountId).toBe('google-cloud-owner')
    const token = cloudAccessTokenSchema.parse(
      await responseJson(client.post('/api/me/cloud/google/token', {})),
    )
    expect(token.accessToken).toBe('first-access')
    const secondToken = cloudAccessTokenSchema.parse(
      await responseJson(secondSession.post('/api/me/cloud/google/token', {})),
    )
    expect(secondToken.accessToken).toBe('first-access')
    expect(fetch).toHaveBeenCalledTimes(2)
    const status = cloudAttemptStatusSchema.parse(
      await responseJson(client.get(`/api/me/cloud/attempts/${began.id}`)),
    )
    expect(status.status).toBe('connected')
    expect(await responseStatus(secondSession.get(`/api/me/cloud/attempts/${began.id}`))).toBe(404)
    const disconnected = await client.post('/api/me/cloud/google/disconnect', {})
    expect(disconnected.headers.get('cache-control')).toBe('no-store')
    expect(await responseJson(Promise.resolve(disconnected))).toEqual({
      disconnected: true,
      providerRevoked: true,
    })
    expect(await responseStatus(secondSession.post('/api/me/cloud/google/token', {}))).toBe(409)
    expect(await responseStatus(client.get(callback))).toBe(403)
  })

  it('refuses foreign account bindings and forged fields while another account stays disconnected', async () => {
    const { harness, client, userId } = await actor()
    const other = new TestClient(harness.app, harness.env)
    expect(await responseStatus(other.get('/api/me/cloud/connections'))).toBe(401)
    await other.signUpAndVerify(harness.mailbox, { ...PERSON, email: 'other-cloud@example.test' })
    expect(
      await responseStatus(
        other.request('/api/me/cloud/google/connect', {
          method: 'POST',
          headers: { 'content-type': 'application/json', [ACCOUNT_ID_HEADER]: userId },
          body: '{}',
        }),
      ),
    ).toBe(403)
    expect(
      await responseStatus(client.post('/api/me/cloud/google/connect', { userId: 'foreign' })),
    ).toBe(400)
    expect(await responseStatus(client.post('/api/me/cloud/unknown/connect', {}))).toBe(400)
    const status = cloudConnectionsSchema.parse(
      await responseJson(other.get('/api/me/cloud/connections')),
    )
    expect(status.connections.every((connection) => connection.status === 'disconnected')).toBe(
      true,
    )
    expect(
      status.connections.find((connection) => connection.provider === 'dropbox')?.isConfigured,
    ).toBe(false)
    expect(await responseStatus(other.post('/api/me/cloud/dropbox/connect', {}))).toBe(503)
    client.useOrigin('https://foreign.example')
    expect(await responseStatus(client.post('/api/me/cloud/google/connect', {}))).toBe(403)
  })
  it('serializes refresh, rotates encrypted tokens, and never needs another authorization code', async () => {
    const context = await actor()
    const fetch = providerReplies()
    await authorize(context.client)
    await expire(context)
    const pending = Promise.withResolvers<Response>()
    fetch.mockReturnValueOnce(pending.promise)
    const first = context.client.post('/api/me/cloud/google/token', {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(await responseJson(context.client.post('/api/me/cloud/google/token', {}))).toEqual({
      isRefreshing: true,
      retryAfterMs: 1000,
    })
    expect(formBody(fetch.mock.calls[2]?.[1]).get('grant_type')).toBe('refresh_token')
    expect(formBody(fetch.mock.calls[2]?.[1]).get('refresh_token')).toBe('durable-refresh')
    pending.resolve(
      Response.json({
        access_token: 'rotated-access',
        refresh_token: 'rotated-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    )
    expect(cloudAccessTokenSchema.parse(await responseJson(first)).accessToken).toBe(
      'rotated-access',
    )
    expect(
      JSON.stringify(await context.harness.services.cloud.find(context.userId, 'google')),
    ).not.toContain('rotated-refresh')
    const again = cloudAccessTokenSchema.parse(
      await responseJson(context.client.post('/api/me/cloud/google/token', {})),
    )
    expect(again.accessToken).toBe('rotated-access')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('prevents late refresh and callback results from restoring a disconnected or cancelled grant', async () => {
    const context = await actor()
    const fetch = providerReplies()
    const started = await authorize(context.client)
    await expire(context)
    const pending = Promise.withResolvers<Response>()
    fetch.mockReturnValueOnce(pending.promise)
    const refresh = context.client.post('/api/me/cloud/google/token', {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(await responseStatus(context.client.post('/api/me/cloud/google/disconnect', {}))).toBe(
      200,
    )
    pending.resolve(
      Response.json({
        access_token: 'late-access',
        refresh_token: 'late-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    )
    expect(await responseStatus(refresh)).toBe(409)
    const disconnected = await context.harness.services.cloud.find(context.userId, 'google')
    expect(disconnected?.refreshCipher).toBeNull()
    expect(await responseStatus(context.client.get(started.callback))).toBe(403)
    const next = cloudConnectSchema.parse(
      await responseJson(context.client.post('/api/me/cloud/google/connect', {})),
    )
    expect(
      await responseStatus(context.client.post(`/api/me/cloud/attempts/${next.id}/cancel`, {})),
    ).toBe(200)
    const state = new URL(next.authorizationUrl).searchParams.get('state')
    expect(
      await responseStatus(
        context.client.get(`/api/cloud/google/callback?state=${state ?? ''}&code=cancelled`),
      ),
    ).toBe(403)
  })

  it('retains transient refresh failures for retry but requires reconnect after revoked permission', async () => {
    const context = await actor()
    const fetch = providerReplies()
    await authorize(context.client)
    await expire(context)
    fetch.mockRejectedValueOnce(new TypeError('Transport unavailable'))
    expect(await responseStatus(context.client.post('/api/me/cloud/google/token', {}))).toBe(503)
    const retryable = await context.harness.services.cloud.find(context.userId, 'google')
    expect(retryable?.status).toBe('connected')
    fetch.mockResolvedValueOnce(
      Response.json(
        { error: 'invalid_grant', error_description: 'never publish provider secret details' },
        { status: 400 },
      ),
    )
    expect(await responseStatus(context.client.post('/api/me/cloud/google/token', {}))).toBe(409)
    const revoked = await context.harness.services.cloud.find(context.userId, 'google')
    expect(revoked?.status).toBe('reconnect')
    expect(revoked?.refreshCipher).toBeNull()
  })

  it('invalidates cached credentials when the configured OAuth application changes', async () => {
    const context = await actor()
    const fetch = providerReplies()
    await authorize(context.client)
    context.harness.services.config.GOOGLE_OAUTH_CLIENT_ID = 'replacement-client'
    expect(await responseStatus(context.client.post('/api/me/cloud/google/token', {}))).toBe(409)
    const status = cloudConnectionsSchema.parse(
      await responseJson(context.client.get('/api/me/cloud/connections')),
    )
    expect(status.connections.find((item) => item.provider === 'google')?.status).toBe('reconnect')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
