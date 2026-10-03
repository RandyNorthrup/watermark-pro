import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { invitationTokenHash } from './invitation-admission'
import { publicAdmissionEmailHash } from './public-admission-key'
import { HUMAN_VERIFICATION } from '../../shared/human-verification'
import { INVITATION_HEADER } from '../../shared/invitation'
import { PUBLIC_PLANS, workspaceCapacity } from '../../shared/plans'
import { PUBLIC_SIGNUP_POLICY } from '../../shared/public-signup'
import { findLink, TestClient } from '../test-support/client'
import { seedInviter } from '../test-support/inviter'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness, type TestHarnessOptions } from '../test-support/test-app'

const captcha = {
  siteKey: 'fixture-site-key',
  secretKey: 'fixture-secret-key',
  siteVerifyUrl: 'https://verify.example.test/',
}
const person = {
  name: 'Public user',
  email: 'public@example.test',
  password: 'public account fixture passphrase',
}
const userSchema = z.object({
  id: z.string(),
  membershipCohort: z.string(),
  role: z.string(),
  emailVerified: z.boolean(),
})
let tokenCount = 0
const challenge = () => ({ 'x-captcha-response': `public-challenge-${String(++tokenCount)}` })

beforeEach(() => {
  tokenCount = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          success: true,
          hostname: 'localhost',
          action: HUMAN_VERIFICATION.actions.admission,
        }),
      ),
    ),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function fixture(options: TestHarnessOptions = {}) {
  const harness = createTestHarness({ publicSignup: true, captcha, ...options })
  const client = new TestClient(harness.app, harness.env)
  const context = await harness.services.auth.$context
  const signup = (
    body: Record<string, unknown> = {},
    headers: Record<string, string> = challenge(),
  ) =>
    client.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ ...person, ...body }),
    })
  return { harness, client, context, signup }
}

describe('separate public admission policy', () => {
  it('stays closed by default while fixture bypass retains private fixtures', async () => {
    const closed = createTestHarness({ invitationOnly: true })
    const result = await new TestClient(closed.app, closed.env).post(
      '/api/auth/sign-up/email',
      person,
    )
    expect(result.status).toBe(403)
    const closedContext = await closed.services.auth.$context
    expect(await closedContext.adapter.count({ model: 'user' })).toBe(0)
    const disposable = createTestHarness()
    await new TestClient(disposable.app, disposable.env).post('/api/auth/sign-up/email', person)
    const ctx = await disposable.services.auth.$context
    expect(
      await ctx.adapter.findOne({
        model: 'user',
        where: [{ field: 'email', value: person.email }],
      }),
    ).toMatchObject({ membershipCohort: 'private' })
  })

  it('reserves before creation, rejects cohort forgery, and requires email verification before Free workspace', async () => {
    const { harness, context, client, signup } = await fixture()
    const reserve = vi.spyOn(harness.services.publicAdmissions, 'reserve')
    expect(await responseStatus(signup({ membershipCohort: 'private', role: 'admin' }))).toBe(400)
    expect(await context.adapter.count({ model: 'user' })).toBe(0)
    const result = await signup()
    expect(result.status).toBe(200)
    expect(reserve).toHaveBeenCalledWith(person.email)
    const user = userSchema.parse(
      await context.adapter.findOne({
        model: 'user',
        where: [{ field: 'email', value: person.email }],
      }),
    )
    expect(user).toMatchObject({ membershipCohort: 'public', role: 'user', emailVerified: false })
    expect(await responseStatus(client.post('/api/me/workspace', {}))).toBe(401)
    expect(await context.adapter.count({ model: 'organization' })).toBe(0)
    await client.get(findLink(harness.mailbox, person.email, '/api/auth/verify-email'))
    expect(await responseStatus(client.post('/api/me/workspace', {}))).toBe(200)
    const organizationId = await harness.services.accounts.ensurePrivateWorkspace(user.id)
    expect(workspaceCapacity(await harness.plans.get(organizationId))).toMatchObject({
      storageBytes: PUBLIC_PLANS.free.storageBytes,
      photos: PUBLIC_PLANS.free.photos,
      logos: PUBLIC_PLANS.free.logos,
      members: 1,
    })
    expect(await responseStatus(client.get('/api/me/private-invitation-budget'))).toBe(403)
    expect(await responseStatus(client.post('/api/me/referral-link', {}))).toBe(403)
  })

  it.each(['malformed/token', 'unknown-private-invitation'])(
    'never falls back public for supplied invitation %s',
    async (token) => {
      const { context, signup } = await fixture()
      const denied = await signup({}, { ...challenge(), [INVITATION_HEADER]: token })
      expect(denied.status).toBe(403)
      expect(await context.adapter.count({ model: 'user' })).toBe(0)
    },
  )

  it('retains trusted private invitation admission and its separate two-invite grant', async () => {
    const { harness, context, signup } = await fixture()
    await seedInviter(harness, 'private-inviter')
    const token = 'trusted-private-invitation'
    const expiresAt = new Date(Date.now() + PUBLIC_SIGNUP_POLICY.reservationMs)
    expect(
      await harness.services.accounts.createInvitation({
        id: 'invite',
        role: 'user',
        inviterId: 'private-inviter',
        email: person.email,
        tokenHash: await invitationTokenHash(token),
        createdAt: new Date(),
        expiresAt,
        acceptedAt: null,
        acceptedUserId: null,
        revokedAt: null,
      }),
    ).toBe(true)
    const reserve = vi.spyOn(harness.services.publicAdmissions, 'reserve')
    const admitted = await signup({}, { ...challenge(), [INVITATION_HEADER]: token })
    expect(admitted.status).toBe(200)
    const user = userSchema.parse(
      await context.adapter.findOne({
        model: 'user',
        where: [{ field: 'email', value: person.email }],
      }),
    )
    expect(user.membershipCohort).toBe('private')
    expect(reserve).not.toHaveBeenCalled()
    expect(await harness.services.accounts.invitationBudget(user.id)).toMatchObject({
      limit: 2,
      available: 2,
    })
  })

  it.each([{}, { 'x-captcha-response': '' }])(
    'does not let public flag bypass human verification %j',
    async (headers) => {
      const { context, signup } = await fixture()
      expect(await responseStatus(signup({}, headers))).toBe(400)
      expect(await context.adapter.count({ model: 'user' })).toBe(0)
    },
  )

  it('refuses exhausted durable capacity before account or mail creation', async () => {
    const { harness, context, signup } = await fixture()
    for (let index = 0; index < PUBLIC_SIGNUP_POLICY.admissionsPerWindow; index++)
      expect(
        await harness.services.publicAdmissions.reserve(`reserved-${String(index)}@example.test`),
      ).not.toBeNull()
    expect(await responseStatus(signup())).toBe(429)
    expect(await context.adapter.count({ model: 'user' })).toBe(0)
    expect(harness.mailbox.messages()).toEqual([])
    expect(await responseStatus(new TestClient(harness.app, harness.env).get('/api/config'))).toBe(
      200,
    )
    expect(
      await responseJson(new TestClient(harness.app, harness.env).get('/api/config')),
    ).toMatchObject({ publicSignupEnabled: true })
  })

  it('retains the same last hold and completes actual signup when all daily slots are occupied', async () => {
    const { harness, signup } = await fixture()
    const heldId = await harness.services.publicAdmissions.reserve(person.email)
    expect(heldId).not.toBeNull()
    for (let index = 1; index < PUBLIC_SIGNUP_POLICY.admissionsPerWindow; index++) {
      expect(
        await harness.services.publicAdmissions.reserve(`last-hold-${String(index)}@example.test`),
      ).not.toBeNull()
    }
    expect(await harness.services.publicAdmissions.reserve(person.email)).toBe(heldId)
    expect(await responseStatus(signup())).toBe(200)
    expect(await harness.services.publicAdmissions.reserve('overflow@example.test')).toBeNull()
  })

  it.each(['api', 'unexpected'] as const)(
    'releases the hold after actual %s adapter insertion failure and permits a fresh retry',
    async (failure) => {
      const { harness, context, signup } = await fixture({ userCreationFailure: failure })
      const release = vi.spyOn(harness.services.publicAdmissions, 'release')
      const response = await signup()
      expect(response.status).toBe(failure === 'api' ? 409 : 422)
      expect(await response.text()).not.toContain('PRIVATE_ADAPTER_FAILURE_CANARY')
      expect(await context.adapter.count({ model: 'user' })).toBe(0)
      expect(release).toHaveBeenCalledWith(person.email, expect.any(String))
      expect(await responseStatus(signup())).toBe(200)
      const user = userSchema.parse(
        await context.adapter.findOne({
          model: 'user',
          where: [{ field: 'email', value: person.email }],
        }),
      )
      expect(user.membershipCohort).toBe('public')
      await context.adapter.delete({ model: 'user', where: [{ field: 'id', value: user.id }] })
      expect(await harness.services.publicAdmissions.reserve(person.email)).toBeNull()
    },
  )

  it.each(['google', 'microsoft'] as const)(
    'assigns public OAuth %s and refuses an invalid signed-state private invitation',
    async (providerId) => {
      const { harness, context, client } = await fixture({
        accountOAuth: {
          google: { clientId: 'fixture-google', clientSecret: 'fixture-google-secret' },
          microsoft: { clientId: 'fixture-microsoft', clientSecret: 'fixture-microsoft-secret' },
        },
      })
      const provider = context.socialProviders.find((value) => value.id === providerId)
      if (provider === undefined) throw new Error('Missing named identity provider')
      vi.spyOn(provider, 'validateAuthorizationCode').mockResolvedValue({
        accessToken: 'fixture-access',
        refreshToken: 'fixture-refresh',
        idToken: 'fixture-identity',
        scopes: ['openid', 'profile', 'email'],
      })
      vi.spyOn(provider, 'getUserInfo').mockResolvedValue({
        user: { name: person.name, email: person.email, emailVerified: true },
        data: {
          sub: 'fixture-subject',
          oid: 'fixture-subject',
          iss:
            providerId === 'google'
              ? 'https://accounts.google.com'
              : 'https://login.microsoftonline.com/fixture-tenant/v2.0',
        },
      })
      async function start(token?: string) {
        const response = await client.request('/api/auth/sign-in/social', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...challenge(),
            ...(token !== undefined && { [INVITATION_HEADER]: token }),
          },
          body: JSON.stringify({
            provider: providerId,
            callbackURL: '/app',
            errorCallbackURL: '/login',
            requestSignUp: true,
          }),
        })
        expect(response.status).toBe(200)
        const { url } = z.object({ url: z.url() }).parse(await response.json())
        const state = new URL(url).searchParams.get('state')
        if (state === null) throw new Error('Missing actual signed OAuth state')
        return `/api/auth/callback/${providerId}?state=${encodeURIComponent(state)}&code=fixture-code`
      }
      const reserve = vi.spyOn(harness.services.publicAdmissions, 'reserve')
      const denied = await client.get(await start('unknown-private-invitation'))
      expect(denied.headers.get('location')).toContain('error=INVITATION_REQUIRED')
      expect(await context.adapter.count({ model: 'user' })).toBe(0)
      expect(reserve).not.toHaveBeenCalled()
      const admitted = await client.get(await start())
      expect(admitted.headers.get('location')).toBe('/app')
      const user = userSchema.parse(
        await context.adapter.findOne({
          model: 'user',
          where: [{ field: 'email', value: person.email }],
        }),
      )
      expect(user).toMatchObject({ membershipCohort: 'public', emailVerified: true, role: 'user' })
    },
  )

  it('allows an explicit private-workspace grant without exposing peer admission fields or inheriting private rights', async () => {
    const { harness, context, client: member, signup } = await fixture()
    await seedInviter(harness, 'privacy-inviter')
    const privatePerson = {
      name: 'Private workspace owner',
      email: 'private-workspace-owner@example.test',
      password: 'private owner fixture passphrase',
    }
    const token = 'private-owner-admission-token'
    const expiresAt = new Date(Date.now() + PUBLIC_SIGNUP_POLICY.reservationMs)
    await harness.services.accounts.createInvitation({
      id: 'owner-admission',
      role: 'user',
      inviterId: 'privacy-inviter',
      email: privatePerson.email,
      tokenHash: await invitationTokenHash(token),
      createdAt: new Date(),
      expiresAt,
      acceptedAt: null,
      acceptedUserId: null,
      revokedAt: null,
    })
    const owner = new TestClient(harness.app, harness.env)
    const privateSignup = await owner.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...challenge(), [INVITATION_HEADER]: token },
      body: JSON.stringify(privatePerson),
    })
    expect(privateSignup.status).toBe(200)
    await owner.get(findLink(harness.mailbox, privatePerson.email, '/api/auth/verify-email'))
    const privateSignIn = await owner.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...challenge() },
      body: JSON.stringify({ email: privatePerson.email, password: privatePerson.password }),
    })
    expect(privateSignIn.status).toBe(200)
    const selfSchema = z.object({
      user: z.object({ id: z.string(), membershipCohort: z.string() }),
    })
    const ownerIdentity = selfSchema.parse(await responseJson(owner.get('/api/auth/get-session')))
    const organizationId = await harness.services.accounts.ensurePrivateWorkspace(
      ownerIdentity.user.id,
    )
    await context.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: ownerIdentity.user.id }],
      update: { banReason: 'PRIVATE_PEER_REASON_CANARY', banned: false },
    })
    expect(await responseStatus(signup())).toBe(200)
    await member.get(findLink(harness.mailbox, person.email, '/api/auth/verify-email'))
    const grant = await owner.post(`/api/orgs/${organizationId}/access/members`, {
      email: person.email,
      role: 'viewer',
      notify: false,
    })
    expect(grant.status).toBe(204)
    const peerUserSchema = z.record(z.string(), z.unknown())
    const peerMemberSchema = z.object({ user: peerUserSchema })
    const memberRows = z.object({ members: z.array(peerMemberSchema) })
    for (const endpoint of [
      '/api/auth/organization/get-full-organization',
      '/api/auth/organization/list-members',
    ]) {
      const response = await member.get(`${endpoint}?organizationId=${organizationId}`)
      expect(response.status).toBe(200)
      const body: unknown = await response.json()
      const roster = memberRows.parse(body)
      expect(roster.members).toHaveLength(2)
      for (const row of roster.members)
        expect(Object.keys(row.user).toSorted((left, right) => left.localeCompare(right))).toEqual([
          'email',
          'id',
          'image',
          'name',
        ])
      expect(JSON.stringify(body)).not.toContain('PRIVATE_PEER_REASON_CANARY')
    }
    const self = selfSchema.parse(await responseJson(member.get('/api/auth/get-session')))
    expect(self.user.membershipCohort).toBe('public')
    expect(await responseStatus(member.get(`/api/orgs/${organizationId}/watermarks`))).toBe(200)
    expect(await responseStatus(member.get('/api/me/private-invitation-budget'))).toBe(403)
    expect(await responseStatus(member.post('/api/me/referral-link', {}))).toBe(403)
  })

  it('uses purpose-bound, normalized secret-keyed hashes', async () => {
    const hash = await publicAdmissionEmailHash(person.email, 'fixture-key-one')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(await publicAdmissionEmailHash(person.email.toUpperCase(), 'fixture-key-one')).toBe(hash)
    expect(await publicAdmissionEmailHash(person.email, 'fixture-key-two')).not.toBe(hash)
    expect(hash).not.toContain(person.email)
  })
})
