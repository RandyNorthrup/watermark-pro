import { afterEach, expect, it, vi } from 'vitest'

import type { CloudProviderConfig } from './provider-config'
import { cloudAccountIdentity, exchangeCloudTokens } from './provider-tokens'

const CONFIG: CloudProviderConfig = {
  provider: 'google',
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
  encryptionSecret: '00000000000000000000000000000000',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  redirectUri: 'https://app.example.test/api/cloud/google/callback',
  scopes: 'https://www.googleapis.com/auth/drive.file',
}

afterEach(() => vi.unstubAllGlobals())

it('constructs real workerd requests for confidential exchange and account identity without following redirects', async () => {
  const requests: Request[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((input, init) => {
      // Preserve the native request constructor: a Node-only fetch mock hid
      // workerd's rejection of redirect:error before any provider request.
      const request = new Request(input, init)
      requests.push(request)
      if (request.url === CONFIG.tokenUrl)
        return Promise.resolve(
          Response.json({
            access_token: 'fixture-access',
            refresh_token: 'fixture-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: CONFIG.scopes,
          }),
        )
      return Promise.resolve(
        Response.json({
          user: { permissionId: 'fixture-account', displayName: 'Fixture Account' },
        }),
      )
    }),
  )
  const tokens = await exchangeCloudTokens(CONFIG, {
    code: 'fixture-code',
    verifier: 'fixture-verifier',
  })
  expect(tokens.accessToken).toBe('fixture-access')
  expect(await cloudAccountIdentity('google', tokens.accessToken)).toEqual({
    id: 'fixture-account',
    label: 'Fixture Account',
  })
  expect(requests).toHaveLength(2)
  expect(requests.map((request) => request.redirect)).toEqual(['manual', 'manual'])
  const exchange = requests[0]
  if (exchange === undefined) throw new Error('Expected exchange request')
  expect(exchange.method).toBe('POST')
  const form = await exchange.formData()
  expect(form.get('client_secret')).toBe(CONFIG.clientSecret)
  expect(form.get('code_verifier')).toBe('fixture-verifier')
  expect(requests[1]?.headers.get('authorization')).toBe('Bearer fixture-access')
})

it('rejects a native redirect response without sending credentials to its destination', async () => {
  const requests: Request[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(
        new Response(null, {
          status: 307,
          headers: { location: 'https://attacker.test/collect' },
        }),
      )
    }),
  )
  await expect(
    exchangeCloudTokens(CONFIG, { code: 'fixture-code', verifier: 'fixture-verifier' }),
  ).rejects.toMatchObject({
    requiresReconnect: false,
    message: 'The cloud provider could not complete this request.',
  })
  expect(requests.map((request) => request.url)).toEqual([CONFIG.tokenUrl])
})
