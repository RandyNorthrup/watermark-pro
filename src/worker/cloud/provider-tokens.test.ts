import { afterEach, describe, expect, it, vi } from 'vitest'

import { cloudAuthorizationUrl, cloudProviderConfig } from './provider-config'
import { cloudAccountIdentity, exchangeCloudTokens } from './provider-tokens'
import { CLOUD_PROVIDERS } from '../../shared/cloud-connections'
import { createTestHarness } from '../test-support/test-app'

const ENV = {
  CLOUD_TOKEN_SECRET: 'fixture-encryption-secret-longer-than32',
  GOOGLE_OAUTH_CLIENT_ID: 'google-client',
  GOOGLE_CLOUD_CLIENT_SECRET: 'google-secret',
  DROPBOX_APP_KEY: 'dropbox-client',
  DROPBOX_APP_SECRET: 'dropbox-secret',
  MICROSOFT_CLIENT_ID: 'microsoft-client',
  MICROSOFT_CLOUD_CLIENT_SECRET: 'microsoft-secret',
}
afterEach(() => vi.unstubAllGlobals())

describe.each(CLOUD_PROVIDERS)('%s confidential protocol', (provider) => {
  function configuration() {
    const { services } = createTestHarness({ cloudConnections: ENV })
    const config = cloudProviderConfig(services.config, provider)
    if (config === null) throw new Error('Fixture must enable provider')
    return config
  }

  it('requires server secrets and binds explicit consent to PKCE and the provider callback', () => {
    expect(cloudProviderConfig(createTestHarness().services.config, provider)).toBeNull()
    const config = configuration()
    const url = new URL(cloudAuthorizationUrl(config, 'opaque-state', 'sha256-challenge'))
    expect(url.searchParams.get('redirect_uri')).toBe(
      `http://localhost:5273/api/cloud/${provider}/callback`,
    )
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('sha256-challenge')
    expect(url.searchParams.get('state')).toBe('opaque-state')
    expect(url.href).not.toContain(config.clientSecret)
    if (provider === 'google') expect(url.searchParams.get('access_type')).toBe('offline')
    else if (provider === 'dropbox')
      expect(url.searchParams.get('token_access_type')).toBe('offline')
    else expect(url.searchParams.get('scope')).toContain('offline_access')
  })

  it('exchanges confidential codes and preserves or rotates refresh credentials without weakening scopes', async () => {
    const config = configuration()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'access',
          refresh_token: 'refresh',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: 'new-access', token_type: 'bearer', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'rotated-access',
          refresh_token: 'rotated-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: config.scopes,
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    const first = await exchangeCloudTokens(config, { code: 'code', verifier: 'verifier' })
    expect(first).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      scopes: config.scopes,
    })
    const init = fetcher.mock.calls[0]?.[1]
    expect(init).toMatchObject({ redirect: 'manual', cache: 'no-store' })
    if (!(init?.body instanceof URLSearchParams)) throw new Error('Expected confidential form')
    expect(init.body.get('client_secret')).toBe(config.clientSecret)
    expect(init.body.get('code_verifier')).toBe('verifier')
    expect(
      await exchangeCloudTokens(config, { refreshToken: 'refresh', scopes: config.scopes }),
    ).toMatchObject({ refreshToken: 'refresh', accessToken: 'new-access' })
    expect(
      await exchangeCloudTokens(config, { refreshToken: 'refresh', scopes: config.scopes }),
    ).toMatchObject({ refreshToken: 'rotated-refresh', accessToken: 'rotated-access' })
    fetcher.mockResolvedValueOnce(
      Response.json({
        access_token: 'access',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'wrong-scope',
      }),
    )
    await expect(
      exchangeCloudTokens(config, { code: 'code', verifier: 'verifier' }),
    ).rejects.toMatchObject({ requiresReconnect: true })
  })

  it.each([301, 302, 303, 307, 308])(
    'refuses HTTP %s before reading or following its credential-bearing response',
    async (status) => {
      const read = vi.fn()
      const cancel = vi.fn()
      const body = new ReadableStream<Uint8Array>({ pull: read, cancel }, { highWaterMark: 0 })
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          status,
          headers: { location: 'https://attacker.test/credentials' },
        }),
      )
      vi.stubGlobal('fetch', fetcher)
      await expect(
        exchangeCloudTokens(configuration(), {
          code: 'private-code',
          verifier: 'private-verifier',
        }),
      ).rejects.toMatchObject({
        requiresReconnect: false,
        message: 'The cloud provider could not complete this request.',
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', cache: 'no-store' })
      expect(body.locked).toBe(false)
      expect(read).not.toHaveBeenCalled()
      expect(cancel).toHaveBeenCalledOnce()
    },
  )

  it('sanitizes provider failures, rejects oversized responses, and never invents a missing refresh token', async () => {
    const config = configuration()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'invalid_grant', error_description: 'SECRET_CANARY' },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response('x'.repeat(131_073)))
      .mockRejectedValueOnce(new Error('SECRET_CANARY'))
    vi.stubGlobal('fetch', fetcher)
    await expect(
      exchangeCloudTokens(config, { code: 'code', verifier: 'verifier' }),
    ).rejects.toMatchObject({
      requiresReconnect: true,
      message: 'The cloud connection needs authorization again.',
    })
    await expect(
      exchangeCloudTokens(config, { code: 'code', verifier: 'verifier' }),
    ).rejects.toMatchObject({ requiresReconnect: true })
    for (let attempt = 0; attempt < 2; attempt += 1)
      await expect(
        exchangeCloudTokens(config, { code: 'code', verifier: 'verifier' }),
      ).rejects.toMatchObject({
        requiresReconnect: false,
        message: 'The cloud provider could not complete this request.',
      })
  })
})

it('reads cloud identities independently and refuses an untrusted Microsoft discovery endpoint', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        user: {
          permissionId: 'drive-id',
          displayName: 'Drive User',
          emailAddress: 'drive@example.test',
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        account_id: 'dropbox-id',
        email: 'dropbox@example.test',
        name: { display_name: 'Dropbox User' },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ userinfo_endpoint: 'https://graph.microsoft.com/oidc/userinfo' }),
    )
    .mockResolvedValueOnce(Response.json({ sub: 'microsoft-id', name: 'Microsoft User' }))
    .mockResolvedValueOnce(Response.json({ userinfo_endpoint: 'https://attacker.test/collect' }))
  vi.stubGlobal('fetch', fetcher)
  expect(await cloudAccountIdentity('google', 'token')).toEqual({
    id: 'drive-id',
    label: 'drive@example.test',
  })
  expect(await cloudAccountIdentity('dropbox', 'token')).toEqual({
    id: 'dropbox-id',
    label: 'dropbox@example.test',
  })
  expect(await cloudAccountIdentity('onedrive', 'token')).toEqual({
    id: 'microsoft-id',
    label: 'Microsoft User',
  })
  expect(fetcher.mock.calls[2]?.[1]?.headers).toBeUndefined()
  await expect(cloudAccountIdentity('onedrive', 'token')).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledTimes(5)
})

it.each([
  [{ sub: 'microsoft-id', given_name: 'Microsoft', family_name: 'User' }, 'Microsoft User'],
  [{ sub: 'microsoft-id', name: ' ', email: 'cloud@example.test' }, 'cloud@example.test'],
  [{ sub: 'microsoft-id' }, 'microsoft-id'],
  [
    { sub: 'microsoft-id', name: null, given_name: null, family_name: null, email: null },
    'microsoft-id',
  ],
] as const)(
  'accepts an authenticated Microsoft subject when optional name claims are absent',
  async (payload, label) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ userinfo_endpoint: 'https://graph.microsoft.com/oidc/userinfo' }),
      )
      .mockResolvedValueOnce(Response.json(payload))
    vi.stubGlobal('fetch', fetcher)
    expect(await cloudAccountIdentity('onedrive', 'opaque-microsoft-token')).toEqual({
      id: 'microsoft-id',
      label,
    })
  },
)

it.each([{ name: 'Unbound User' }, { sub: '', name: 'Unbound User' }])(
  'never substitutes a display name for a missing Microsoft subject',
  async (payload) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ userinfo_endpoint: 'https://graph.microsoft.com/oidc/userinfo' }),
      )
      .mockResolvedValueOnce(Response.json(payload))
    vi.stubGlobal('fetch', fetcher)
    await expect(cloudAccountIdentity('onedrive', 'opaque-microsoft-token')).rejects.toThrow()
  },
)
