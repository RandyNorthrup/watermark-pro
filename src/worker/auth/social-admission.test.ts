/** Provider transports are fixtures; the auth handler, state cookie, adapter and hooks are real. */
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { invitationTokenHash } from './invitation-admission'
import { SITE_INVITATION_POLICY } from '../../shared/api-accounts'
import { INVITATION_HEADER } from '../../shared/invitation'
import { findLink, TestClient } from '../test-support/client'
import { seedInviter } from '../test-support/inviter'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const PERSON = {
  name: 'OAuth Person',
  email: 'oauth@example.test',
  password: 'a long existing password',
}
const TOKEN = 'valid-oauth-admission-token'
const AUTHORIZATION = z.object({ url: z.url() })
const SESSION = z
  .object({ user: z.object({ email: z.email(), emailVerified: z.boolean() }) })
  .nullable()
const PROVIDERS = ['google', 'microsoft'] as const
const LEGACY_USER_ID = 'legacy-oauth-user'

type Provider = (typeof PROVIDERS)[number]

async function fixture(providerId: Provider, isEmailVerified = true) {
  const harness = createTestHarness({
    invitationOnly: true,
    accountOAuth: {
      google: { clientId: 'fixture-google', clientSecret: 'fixture-google-secret' },
      microsoft: { clientId: 'fixture-microsoft', clientSecret: 'fixture-microsoft-secret' },
    },
  })
  const context = await harness.services.auth.$context
  await seedInviter(harness, 'fixture-inviter')
  const provider = context.socialProviders.find((candidate) => candidate.id === providerId)
  if (provider === undefined) throw new Error('Fixture provider was not configured')
  vi.spyOn(provider, 'validateAuthorizationCode').mockResolvedValue({
    accessToken: 'fixture-provider-access-token',
    refreshToken: 'fixture-provider-refresh-token',
    idToken: 'fixture-provider-identity-token',
    scopes: ['openid', 'profile', 'email'],
  })
  const identity = vi.spyOn(provider, 'getUserInfo').mockResolvedValue({
    user: { name: PERSON.name, email: PERSON.email, emailVerified: isEmailVerified },
    data: {
      sub: 'fixture-subject',
      oid: 'fixture-subject',
      iss:
        providerId === 'google'
          ? 'https://accounts.google.com'
          : 'https://login.microsoftonline.com/fixture-tenant/v2.0',
    },
  })
  await harness.services.accounts.createInvitation({
    id: 'invitation',
    inviterId: 'fixture-inviter',
    email: PERSON.email,
    tokenHash: await invitationTokenHash(TOKEN),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs),
    acceptedAt: null,
    acceptedUserId: null,
    revokedAt: null,
  })
  const client = new TestClient(harness.app, harness.env)
  async function start(
    token?: string,
    body: Record<string, unknown> = {},
    path = '/sign-in/social',
  ) {
    const response = await client.request(`/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token !== undefined && { [INVITATION_HEADER]: token }),
      },
      body: JSON.stringify({
        provider: providerId,
        callbackURL: '/app',
        errorCallbackURL: '/login',
        requestSignUp: true,
        ...body,
      }),
    })
    expect(response.status).toBe(200)
    const { url } = AUTHORIZATION.parse(await response.json())
    const state = new URL(url).searchParams.get('state')
    if (state === null) throw new Error('Missing OAuth state')
    return {
      url,
      cookies: response.headers.getSetCookie(),
      callback: `/api/auth/callback/${providerId}?state=${encodeURIComponent(state)}&code=fixture-code`,
    }
  }
  return { harness, context, client, identity, start }
}

async function legacyFixture(
  provider: Provider = 'google',
  isLocalEmailVerified = true,
  role: 'admin' | 'user' = 'user',
) {
  const setup = await fixture(provider)
  await setup.context.adapter.create({
    model: 'user',
    forceAllowId: true,
    data: {
      id: LEGACY_USER_ID,
      name: PERSON.name,
      email: PERSON.email,
      emailVerified: isLocalEmailVerified,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
  await setup.harness.services.accounts.revokeInvitation('fixture-inviter', 'invitation')
  expect(await setup.context.adapter.count({ model: 'account' })).toBe(0)
  return setup
}

describe('verified Google recovery for an existing account without sign-in methods', () => {
  it.each(['admin', 'user'] as const)(
    'links the matching verified %s without an invitation or a new workspace',
    async (role) => {
      const { harness, context, client, start } = await legacyFixture('google', true, role)
      const workspace = await harness.services.accounts.ensurePrivateWorkspace(LEGACY_USER_ID)
      const flow = await start()
      const completed = await client.get(flow.callback)
      expect(completed.headers.get('location')).toContain('/app')
      expect(await responseJson(client.get('/api/auth/get-session'))).toMatchObject({
        user: { id: LEGACY_USER_ID, email: PERSON.email, emailVerified: true, role },
      })
      expect(await context.adapter.count({ model: 'user' })).toBe(2)
      expect(await context.adapter.count({ model: 'account' })).toBe(1)
      const accounts = await context.adapter.findMany<{ providerId: string; userId: string }>({
        model: 'account',
      })
      expect(accounts).toMatchObject([{ providerId: 'google', userId: LEGACY_USER_ID }])
      expect(await harness.services.accounts.ensurePrivateWorkspace(LEGACY_USER_ID)).toBe(workspace)
      expect(await context.adapter.count({ model: 'organization' })).toBe(1)
      expect(await context.adapter.count({ model: 'member' })).toBe(1)
      const replay = await client.get(flow.callback)
      expect(replay.headers.get('location')).not.toContain('/app')
      expect(await context.adapter.count({ model: 'account' })).toBe(1)
    },
  )

  it.each(['provider-unverified', 'local-unverified', 'email-mismatch', 'microsoft'] as const)(
    'refuses implicit recovery for %s without creating accounts or users',
    async (reason) => {
      const provider = reason === 'microsoft' ? 'microsoft' : 'google'
      const { context, client, identity, start } = await legacyFixture(
        provider,
        reason !== 'local-unverified',
      )
      if (reason === 'provider-unverified' || reason === 'email-mismatch')
        identity.mockResolvedValue({
          user: {
            name: PERSON.name,
            email: reason === 'email-mismatch' ? 'different@example.test' : PERSON.email,
            emailVerified: reason !== 'provider-unverified',
          },
          data: { sub: 'fixture-subject', iss: 'https://accounts.google.com' },
        })
      const flow = await start()
      const completed = await client.get(flow.callback)
      expect(completed.headers.get('location')).not.toContain('/app')
      expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
      expect(await context.adapter.count({ model: 'user' })).toBe(2)
      expect(await context.adapter.count({ model: 'account' })).toBe(0)
    },
  )

  it.each([false, true])(
    'requires explicit linking for an existing provider account (forged link %s)',
    async (forgeLink) => {
      const { context, client, start } = await legacyFixture()
      await context.adapter.create({
        model: 'account',
        data: {
          userId: LEGACY_USER_ID,
          providerId: 'microsoft',
          accountId: 'existing-microsoft-subject',
          issuer: 'https://login.microsoftonline.com/fixture-tenant/v2.0',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
      const flow = await start(
        undefined,
        forgeLink
          ? { additionalData: { link: { userId: LEGACY_USER_ID, email: PERSON.email } } }
          : {},
      )
      const completed = await client.get(flow.callback)
      expect(completed.headers.get('location')).not.toContain('/app')
      expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
      expect(await context.adapter.count({ model: 'account' })).toBe(1)
      expect(await context.adapter.count({ model: 'user' })).toBe(2)
    },
  )
})

describe.each(PROVIDERS)('%s account OAuth admission', (provider) => {
  it.each([
    ['targeted', 'banned'],
    ['targeted', 'deleted'],
    ['referral', 'banned'],
    ['referral', 'deleted'],
  ] as const)(
    'rechecks a %s invitation after its inviter is %s while OAuth consent is pending',
    async (kind, state) => {
      const { harness, context, client, start } = await fixture(provider)
      const token = kind === 'targeted' ? TOKEN : 'reusable-oauth-fixture-token'
      const hash = await invitationTokenHash(token)
      if (kind === 'referral')
        await harness.services.accounts.saveReferralLink(
          {
            id: 'oauth-referral',
            userId: 'fixture-inviter',
            nonce: 'fixture-nonce',
            tokenHash: hash,
            createdAt: new Date(),
            revokedAt: null,
          },
          false,
        )
      expect(await harness.services.accounts.pendingInvitation(hash, PERSON.email)).not.toBeNull()
      const flow = await start(token)
      if (state === 'deleted')
        await context.adapter.delete({
          model: 'user',
          where: [{ field: 'id', value: 'fixture-inviter' }],
        })
      else
        await context.adapter.update({
          model: 'user',
          where: [{ field: 'id', value: 'fixture-inviter' }],
          update: { banned: true, banReason: 'PRIVATE_BAN_CANARY' },
        })
      const response = await client.get(flow.callback)
      const location = response.headers.get('location')
      expect(location).toContain('INVITATION_REQUIRED')
      expect(location).not.toContain('PRIVATE_BAN_CANARY')
      expect(location).not.toContain(state)
      expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
      expect(
        await context.adapter.findOne({
          model: 'user',
          where: [{ field: 'email', value: PERSON.email }],
        }),
      ).toBeNull()
    },
  )
  it('creates an invited verified account and admits a returning identity without another invitation', async () => {
    const { harness, context, client, start } = await fixture(provider)
    const flow = await start(TOKEN)
    const scopes = new URL(flow.url).searchParams.get('scope')?.split(' ')
    expect(scopes).toContain('openid')
    expect(scopes?.some((scope) => /Files\.|drive|offline_access|User.Read/.test(scope))).toBe(
      false,
    )
    const completed = await client.get(flow.callback)
    expect(completed.headers.get('location')).toContain('/app')
    const currentSession = SESSION.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(currentSession?.user.email).toBe(PERSON.email)
    expect(await context.adapter.count({ model: 'user' })).toBe(2)
    expect(await context.adapter.count({ model: 'member' })).toBe(0)
    const accounts = await context.adapter.findMany<{
      accessToken: string
      refreshToken: string
      idToken: string | null
    }>({ model: 'account' })
    const stored = z
      .object({
        accessToken: z.string().min(16),
        refreshToken: z.string().min(16),
        idToken: z.null(),
      })
      .parse(accounts[0])
    expect(stored.accessToken).not.toContain('fixture-provider-access-token')
    expect(stored.refreshToken).not.toContain('fixture-provider-refresh-token')
    expect(
      await harness.services.accounts.pendingInvitation(
        await invitationTokenHash(TOKEN),
        PERSON.email,
      ),
    ).toBeNull()
    await client.post('/api/auth/sign-out', {})
    // Accepted invitees are independent accounts; banning the inviter must not
    // prevent their subsequent sign-in without a new invitation.
    await context.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: 'fixture-inviter' }],
      update: { banned: true },
    })
    const returning = await start()
    expect(await responseStatus(client.get(returning.callback))).toBe(302)
    const returningSession = SESSION.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(returningSession?.user.email).toBe(PERSON.email)
    expect(await context.adapter.count({ model: 'user' })).toBe(2)
  })
  it('rejects cloud scopes in account sign-in and refuses an invitation for another email', async () => {
    const { context, client, identity, start } = await fixture(provider)
    const scopeRequest = await client.post('/api/auth/sign-in/social', {
      provider,
      callbackURL: '/app',
      scopes: ['Files.ReadWrite'],
    })
    expect(scopeRequest.status).toBe(400)
    identity.mockResolvedValueOnce({
      user: { name: 'Other identity', email: 'other@example.test', emailVerified: true },
      data: {
        sub: 'other-subject',
        oid: 'other-subject',
        iss:
          provider === 'google'
            ? 'https://accounts.google.com'
            : 'https://login.microsoftonline.com/fixture-tenant/v2.0',
      },
    })
    const flow = await start(TOKEN)
    const stateCookie = flow.cookies.find((cookie) => cookie.startsWith('lumafoil.state='))
    expect(stateCookie).toContain('Max-Age=600')
    expect(stateCookie).toContain('HttpOnly')
    expect(stateCookie).toContain('SameSite=Lax')
    const rejected = await client.get(flow.callback)
    expect(rejected.headers.get('location')).toContain('INVITATION_REQUIRED')
    expect(await context.adapter.count({ model: 'user' })).toBe(1)
  })
  it.each([undefined, 'unknown-token'])(
    'rejects a new identity without valid invitation %s',
    async (token) => {
      const { context, client, start } = await fixture(provider)
      const flow = await start(token)
      const completed = await client.get(flow.callback)
      expect(completed.headers.get('location')).toContain('INVITATION_REQUIRED')
      expect(await context.adapter.count({ model: 'user' })).toBe(1)
      expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
    },
  )
  it('ignores forged additionalData admission state and refuses callback replay', async () => {
    const { context, client, start } = await fixture(provider)
    const hash = await invitationTokenHash(TOKEN)
    const flow = await start(undefined, {
      additionalData: { admissionHash: hash, serverContext: { admissionHash: hash } },
    })
    const rejected = await client.get(flow.callback)
    expect(rejected.headers.get('location')).toContain('INVITATION_REQUIRED')
    expect(await context.adapter.count({ model: 'user' })).toBe(1)
    const replay = await client.get(flow.callback)
    expect(replay.headers.get('location')).not.toContain('/app')
  })
  it('requires Lumafoil email verification when the provider does not verify email ownership', async () => {
    const { harness, context, client, start } = await fixture(provider, false)
    const flow = await start(TOKEN)
    const completed = await client.get(flow.callback)
    expect(completed.headers.get('location')).toContain('email_not_verified')
    expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
    expect(await context.adapter.count({ model: 'user' })).toBe(2)
    const verify = findLink(harness.mailbox, PERSON.email, '/api/auth/verify-email')
    expect(await responseStatus(client.get(verify))).toBeLessThan(400)
    const verifiedSession = SESSION.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(verifiedSession?.user.emailVerified).toBe(true)
  })
  it('does not implicitly attach an OAuth identity to an existing password account', async () => {
    const { harness, context, client, start } = await fixture(provider)
    const signup = await client.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [INVITATION_HEADER]: TOKEN },
      body: JSON.stringify(PERSON),
    })
    expect(signup.status).toBe(200)
    await client.get(findLink(harness.mailbox, PERSON.email, '/api/auth/verify-email'))
    await client.post('/api/auth/sign-out', {})
    const flow = await start()
    const completed = await client.get(flow.callback)
    expect(completed.headers.get('location')).toContain('account')
    expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
    expect(await context.adapter.count({ model: 'account' })).toBe(1)
    expect(await responseStatus(client.post('/api/auth/sign-in/email', PERSON))).toBe(200)
    const linkFlow = await start(undefined, { callbackURL: '/app/account' }, '/link-social')
    const linked = await client.get(linkFlow.callback)
    expect(linked.headers.get('location')).toContain('/app/account')
    expect(await context.adapter.count({ model: 'account' })).toBe(2)
  })
})
