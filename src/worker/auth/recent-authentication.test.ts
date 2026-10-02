import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  credentialProofForNewSession,
  hasRecentCredentialProof,
  requiresRecentAuthentication,
} from './recent-authentication'
import { RECENT_AUTHENTICATION_WINDOW_MS } from '../../shared/constants'
import { findLink, joinAsMember, signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const PERSON = {
  name: 'Credential Fixture',
  email: 'credential@example.test',
  password: 'a credential fixture passphrase',
}
const sessionSchema = z.object({
  session: z.object({
    id: z.string(),
    credentialVerifiedAt: z.coerce.date().nullish(),
    updatedAt: z.coerce.date(),
    activeOrganizationId: z.string().nullish(),
  }),
  user: z.object({ id: z.string() }),
})

describe('recent credential proof', () => {
  const now = Date.now()
  it.each([
    undefined,
    null,
    {},
    { credentialVerifiedAt: null },
    { credentialVerifiedAt: '2026-10-02T00:00:00Z' },
    { credentialVerifiedAt: new Date(NaN) },
    { credentialVerifiedAt: new Date(now + 1) },
    { credentialVerifiedAt: new Date(now - RECENT_AUTHENTICATION_WINDOW_MS) },
  ])('rejects absent or invalid proof %j', (session) => {
    expect(hasRecentCredentialProof(session, now)).toBe(false)
  })
  it('accepts only the bounded past window', () => {
    expect(hasRecentCredentialProof({ credentialVerifiedAt: new Date(now) }, now)).toBe(true)
    expect(
      hasRecentCredentialProof(
        { credentialVerifiedAt: new Date(now - RECENT_AUTHENTICATION_WINDOW_MS + 1) },
        now,
      ),
    ).toBe(true)
  })
  it.each([undefined, '/verify-email', '/get-session', '/reset-password', '/admin/create-user'])(
    'cannot create credential proof from %s',
    async (path) => expect(await credentialProofForNewSession(path)).toBeNull(),
  )
  it.each(['/sign-in/email', '/sign-in/social'])(
    'can create proof only inside successful %s session creation',
    async (path) => expect(await credentialProofForNewSession(path)).toBeInstanceOf(Date),
  )
  it.each([
    ['POST', '/api/me/invitations'],
    ['DELETE', '/api/me/invitations/record'],
    ['POST', '/api/me/referral-link/rotate'],
    ['POST', '/api/me/workspace-invitations/token/accept'],
    ['POST', '/api/me/billing/checkout'],
    ['POST', '/api/me/cloud/google/connect'],
    ['POST', '/api/me/cloud/microsoft/token'],
    ['POST', '/api/me/cloud/dropbox/disconnect'],
    ['PATCH', '/api/admin/users/user'],
    ['POST', '/api/orgs/workspace/access/links'],
    ['POST', '/api/orgs/workspace/shares'],
    ['DELETE', '/api/orgs/workspace/photos/photo'],
  ])('protects %s %s', (method, path) => {
    expect(requiresRecentAuthentication(method, path)).toBe(true)
  })
  it.each([
    ['GET', '/api/me/invitations'],
    ['HEAD', '/api/orgs/workspace/shares'],
    ['OPTIONS', '/api/admin/users'],
    ['POST', '/api/me/workspace'],
    ['POST', '/api/me/bootstrap'],
    ['PATCH', '/api/me'],
    ['POST', '/api/orgs/workspace/photos'],
    ['PUT', '/api/orgs/workspace/watermarks/mark'],
    ['POST', '/api/me/invitations-forged'],
    ['POST', '/api/orgs/workspace/access-forged'],
  ])('retains ordinary-session behavior for %s %s', (method, path) => {
    expect(requiresRecentAuthentication(method, path)).toBe(false)
  })
})

describe('real Better Auth credential proof', () => {
  it('preserves expired proof through client forgery and automatic session renewal', async () => {
    const harness = createTestHarness()
    const client = new TestClient(harness.app, harness.env)
    await client.signUpAndVerify(harness.mailbox, PERSON)
    const context = await harness.services.auth.$context
    const initial = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    const expiredProof = new Date(Date.now() - RECENT_AUTHENTICATION_WINDOW_MS)
    const oldUpdate = new Date(Date.now() - harness.services.auth.options.session.updateAge * 1000)
    const sessionPolicy = harness.services.auth.options.session
    const oldExpiry = new Date(
      Date.now() + (sessionPolicy.expiresIn - sessionPolicy.updateAge) * 1000 - 1,
    )
    await context.adapter.update({
      model: 'session',
      where: [{ field: 'id', value: initial.session.id }],
      update: { credentialVerifiedAt: expiredProof, updatedAt: oldUpdate, expiresAt: oldExpiry },
    })
    await client.post('/api/auth/update-session', { credentialVerifiedAt: new Date() })
    const renewed = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(renewed.session.id).toBe(initial.session.id)
    expect(renewed.session.credentialVerifiedAt).toEqual(expiredProof)
    expect(renewed.session.updatedAt.getTime()).toBeGreaterThan(oldUpdate.getTime())
    const verification = findLink(harness.mailbox, PERSON.email, '/api/auth/verify-email')
    await client.get(verification)
    const replayed = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(replayed.session.id).toBe(initial.session.id)
    expect(replayed.session.credentialVerifiedAt).toEqual(expiredProof)
    const forgedProof = new Date()
    const updateBody = JSON.stringify({ locale: 'en', credentialVerifiedAt: forgedProof })
    expect(await responseStatus(client.get('/api/me/invitations'))).toBe(200)
    expect(
      await responseStatus(
        client.request('/api/me', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: updateBody,
        }),
      ),
    ).toBe(200)
    expect(await responseJson(client.post('/api/me/referral-link', {}))).toEqual({
      error: 'recent_authentication_required',
    })
    expect(await harness.services.accounts.findReferralLink(initial.user.id)).toBeNull()
    await client.signIn(PERSON)
    expect(await responseStatus(client.post('/api/me/referral-link', {}))).toBe(200)
  })

  it('preserves only a still-authorized workspace during same-account sign-in', async () => {
    const harness = createTestHarness()
    const { client, organizationId } = await signUpOwner(harness, PERSON, {
      name: 'Selected workspace',
      slug: 'selected-workspace',
    })
    expect(
      await responseStatus(client.post('/api/auth/organization/set-active', { organizationId })),
    ).toBe(200)
    await client.signIn(PERSON)
    const selected = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(selected.session.activeOrganizationId).toBe(organizationId)
    const context = await harness.services.auth.$context
    await context.adapter.delete({
      model: 'member',
      where: [
        { field: 'organizationId', value: organizationId },
        { field: 'userId', value: selected.user.id },
      ],
    })
    await client.signIn(PERSON)
    const revoked = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(revoked.session.activeOrganizationId).toBeNull()
    expect(await responseStatus(client.get(`/api/orgs/${organizationId}/watermarks`))).toBe(403)
  })

  it('does not carry the old account workspace into a different valid credential sign-in', async () => {
    const harness = createTestHarness()
    const { client, organizationId } = await signUpOwner(harness, PERSON, {
      name: 'Old account',
      slug: 'old-account',
    })
    await client.post('/api/auth/organization/set-active', { organizationId })
    const old = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    const other = { ...PERSON, email: 'other-credential@example.test' }
    const otherClient = new TestClient(harness.app, harness.env)
    await otherClient.signUpAndVerify(harness.mailbox, other)
    await client.signIn(other)
    const changed = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(changed.user.id).not.toBe(old.user.id)
    expect(changed.session.activeOrganizationId).toBeNull()
    expect(changed.session.credentialVerifiedAt).toBeInstanceOf(Date)
    expect(await responseStatus(client.get(`/api/orgs/${organizationId}/watermarks`))).toBe(403)
  })

  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'requires fresh proof without granting workspace privileges to %s',
    async (role) => {
      const harness = createTestHarness()
      const { client: owner, organizationId } = await signUpOwner(harness, PERSON, {
        name: 'Proof workspace',
        slug: 'proof-workspace',
      })
      const context = await harness.services.auth.$context
      const other = { ...PERSON, name: 'Other', email: 'other-proof@example.test' }
      let actor = owner
      if (role === 'anonymous' || role === 'non-member') {
        actor = new TestClient(harness.app, harness.env)
        if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, other)
      } else if (role !== 'owner') {
        actor = await joinAsMember(harness, owner, organizationId, other, role)
      }
      const path = `/api/orgs/${organizationId}/access/links`
      const input = { role: 'viewer', days: 7 }
      if (role === 'anonymous') {
        expect(await responseStatus(actor.post(path, input))).toBe(401)
        return
      }
      const initial = sessionSchema.parse(await responseJson(actor.get('/api/auth/get-session')))
      const expiredProof = new Date(Date.now() - RECENT_AUTHENTICATION_WINDOW_MS)
      await context.adapter.update({
        model: 'session',
        where: [{ field: 'id', value: initial.session.id }],
        update: { credentialVerifiedAt: expiredProof },
      })
      expect(await responseJson(actor.post(path, input))).toEqual({
        error: 'recent_authentication_required',
      })
      expect(await responseStatus(actor.get(`/api/orgs/${organizationId}/watermarks`))).toBe(
        role === 'non-member' ? 403 : 200,
      )
      await actor.signIn(role === 'owner' ? PERSON : other)
      expect(await responseStatus(actor.post(path, input))).toBe(role === 'owner' ? 201 : 403)
    },
  )
  it('keeps email verification usable but refuses sensitive work until a correct password sign-in', async () => {
    const harness = createTestHarness()
    const client = new TestClient(harness.app, harness.env)
    expect(await responseStatus(client.post('/api/auth/sign-up/email', PERSON))).toBe(200)
    const verification = findLink(harness.mailbox, PERSON.email, '/api/auth/verify-email')
    expect(await responseStatus(client.get(verification))).toBe(302)
    const unproved = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(unproved.session.credentialVerifiedAt).toBeNull()
    expect(await responseStatus(client.post('/api/me/workspace', {}))).toBe(200)
    expect(
      await responseJson(client.post('/api/me/invitations', { email: 'invite@example.test' })),
    ).toEqual({ error: 'recent_authentication_required' })
    expect(
      await responseStatus(
        client.post('/api/auth/organization/create', {
          name: 'Forbidden',
          slug: 'forbidden',
        }),
      ),
    ).toBe(403)
    const forgedProof = new Date()
    expect(
      await responseStatus(
        client.post('/api/auth/sign-in/email', {
          ...PERSON,
          password: 'incorrect fixture passphrase',
          credentialVerifiedAt: forgedProof,
        }),
      ),
    ).toBe(401)
    const stillUnproved = sessionSchema.parse(
      await responseJson(client.get('/api/auth/get-session')),
    )
    expect(stillUnproved.session.id).toBe(unproved.session.id)
    expect(stillUnproved.session.credentialVerifiedAt).toBeNull()
    await client.signIn(PERSON)
    const proved = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session')))
    expect(proved.session.id).not.toBe(unproved.session.id)
    expect(proved.session.credentialVerifiedAt).toBeInstanceOf(Date)
    expect(
      await responseStatus(client.post('/api/me/invitations', { email: 'invite@example.test' })),
    ).toBe(201)
    expect(
      await responseStatus(
        client.post('/api/auth/organization/create', {
          name: 'Allowed',
          slug: 'allowed',
        }),
      ),
    ).toBe(200)
  })
})
