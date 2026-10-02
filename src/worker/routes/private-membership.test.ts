import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  MEMBERSHIP_COHORT,
  SITE_INVITATION_POLICY,
  privateInvitationBudgetSchema,
  siteInvitationDtoSchema,
} from '../../shared/api-accounts'
import { INVITATION_HEADER } from '../../shared/invitation'
import { invitationTokenHash } from '../auth/invitation-admission'
import { findLink, joinAsMember, signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness, type TestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Private owner',
  email: 'private-owner@example.test',
  password: 'a private owner fixture passphrase',
}
const OTHER = {
  name: 'Other member',
  email: 'other-member@example.test',
  password: 'another member fixture passphrase',
}
const sessionSchema = z.object({ user: z.object({ id: z.string(), membershipCohort: z.string() }) })
const roleCases = ['owner', 'admin', 'editor', 'viewer', 'non-member'] as const

async function fixture() {
  const harness = createTestHarness()
  const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
    name: 'Private fixture',
    slug: 'private-fixture',
  })
  const context = await harness.services.auth.$context
  const ownerId = sessionSchema.parse(await responseJson(owner.get('/api/auth/get-session'))).user
    .id
  return { harness, owner, organizationId, context, ownerId }
}

async function signup(harness: TestHarness, email: string, token: string) {
  const client = new TestClient(harness.app, harness.env)
  const response = await client.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [INVITATION_HEADER]: token },
    body: JSON.stringify({ ...OTHER, email, membershipCohort: 'private' }),
  })
  return { client, response }
}

describe('server-owned private membership', () => {
  it.each(roleCases)(
    'denies private invitation privileges to a public %s while preserving explicit workspace rights',
    async (role) => {
      const { harness, owner, organizationId, context } = await fixture()
      let actor = owner
      if (role === 'non-member') {
        actor = new TestClient(harness.app, harness.env)
        await actor.signUpAndVerify(harness.mailbox, OTHER)
      } else if (role !== 'owner')
        actor = await joinAsMember(harness, owner, organizationId, OTHER, role)
      const id = sessionSchema.parse(await responseJson(actor.get('/api/auth/get-session'))).user.id
      await context.adapter.update({
        model: 'user',
        where: [{ field: 'id', value: id }],
        update: { membershipCohort: MEMBERSHIP_COHORT.public },
      })
      const messages = harness.mailbox.messages().length
      expect(await responseStatus(actor.get('/api/me/invitations'))).toBe(403)
      expect(await responseStatus(actor.get('/api/me/private-invitation-budget'))).toBe(403)
      expect(
        await responseStatus(actor.post('/api/me/invitations', { email: 'new@example.test' })),
      ).toBe(403)
      expect(
        await responseStatus(actor.request('/api/me/invitations/arbitrary', { method: 'DELETE' })),
      ).toBe(403)
      expect(await responseStatus(actor.post('/api/me/referral-link', {}))).toBe(403)
      expect(await responseStatus(actor.post('/api/me/referral-link/rotate', {}))).toBe(403)
      expect(
        await responseStatus(actor.request('/api/me/referral-link', { method: 'DELETE' })),
      ).toBe(403)
      expect(harness.mailbox.messages()).toHaveLength(messages)
      expect(await harness.services.accounts.listInvitations(id)).toEqual([])
      expect(await harness.services.accounts.findReferralLink(id)).toBeNull()
      expect(await responseStatus(actor.get(`/api/orgs/${organizationId}/watermarks`))).toBe(
        role === 'non-member' ? 403 : 200,
      )
      expect(
        await responseStatus(actor.post('/api/auth/update-user', { membershipCohort: 'private' })),
      ).toBe(400)
      expect(
        await responseStatus(actor.post('/api/auth/update-user', { name: 'Allowed profile edit' })),
      ).toBe(200)
      const current = sessionSchema.parse(await responseJson(actor.get('/api/auth/get-session')))
      expect(current.user.membershipCohort).toBe('public')
    },
  )

  it.each(['pending', 'unknown'])(
    'keeps a %s verified owner out of custom and auth-plugin workspace APIs',
    async (cohort) => {
      const { owner, organizationId, context, ownerId } = await fixture()
      await context.adapter.update({
        model: 'user',
        where: [{ field: 'id', value: ownerId }],
        update: { membershipCohort: cohort },
      })
      expect(await responseStatus(owner.get('/api/auth/get-session'))).toBe(200)
      expect(await responseStatus(owner.get(`/api/orgs/${organizationId}/watermarks`))).toBe(403)
      expect(await responseStatus(owner.post('/api/me/workspace', {}))).toBe(403)
      expect(await responseStatus(owner.get('/api/auth/organization/list'))).toBe(403)
      expect(
        await responseStatus(
          owner.post('/api/auth/organization/create', { name: 'Forbidden', slug: 'forbidden' }),
        ),
      ).toBe(403)
      expect(await context.adapter.count({ model: 'organization' })).toBe(1)
      await context.adapter.update({
        model: 'user',
        where: [{ field: 'id', value: ownerId }],
        update: { membershipCohort: 'private' },
      })
      expect(await responseStatus(owner.get(`/api/orgs/${organizationId}/watermarks`))).toBe(200)
    },
  )

  it.each(['malformed/token', 'unknown-but-valid-token'])(
    'never converts an invalid supplied private invitation %s into uninvited admission',
    async (token) => {
      const harness = createTestHarness()
      const { response } = await signup(harness, OTHER.email, token)
      expect(response.status).toBe(403)
      expect(harness.mailbox.messages()).toEqual([])
      const context = await harness.services.auth.$context
      expect(await context.adapter.count({ model: 'user' })).toBe(0)
    },
  )

  it('leaves a revoked-during-creation admission pending even after email verification', async () => {
    const { harness, owner, ownerId, context } = await fixture()
    const issued = await owner.post('/api/me/invitations', { email: OTHER.email })
    const id = siteInvitationDtoSchema.parse(await issued.json()).id
    const link = new URL(
      findLink(harness.mailbox, OTHER.email, '/signup?invitation='),
      'http://localhost:5273',
    )
    const token = link.searchParams.get('invitation')
    if (token === null) throw new Error('Missing fixture invitation')
    const accept = harness.services.accounts.acceptInvitation.bind(harness.services.accounts)
    vi.spyOn(harness.services.accounts, 'acceptInvitation').mockImplementationOnce(
      async (...args) => {
        expect(await harness.services.accounts.revokeInvitation(ownerId, id)).toBe(true)
        return await accept(...args)
      },
    )
    const { client, response } = await signup(harness, OTHER.email, token)
    expect(response.status).toBe(403)
    const candidate = await context.adapter.findOne<{
      membershipCohort: string
      emailVerified: boolean
    }>({ model: 'user', where: [{ field: 'email', value: OTHER.email }] })
    expect(candidate).toMatchObject({ membershipCohort: 'pending', emailVerified: false })
    expect(
      await responseStatus(
        client.post('/api/auth/send-verification-email', {
          email: OTHER.email,
          callbackURL: '/app',
        }),
      ),
    ).toBe(200)
    await client.get(findLink(harness.mailbox, OTHER.email, '/api/auth/verify-email'))
    const pendingSession = sessionSchema.parse(
      await responseJson(client.get('/api/auth/get-session')),
    )
    expect(pendingSession.user.membershipCohort).toBe('pending')
    expect(await responseStatus(client.post('/api/me/workspace', {}))).toBe(403)
    expect(await responseStatus(client.get('/api/auth/organization/list'))).toBe(403)
    expect(
      await harness.services.accounts.pendingInvitation(
        await invitationTokenHash(token),
        OTHER.email,
      ),
    ).toBeNull()
  })

  it('reserves two invitations, releases revoked capacity, and keeps accepted grants spent across link rotation', async () => {
    const { harness, owner, ownerId, context } = await fixture()
    const emails = ['first@example.test', 'second@example.test'] as const
    const initialBudget = privateInvitationBudgetSchema.parse(
      await responseJson(owner.get('/api/me/private-invitation-budget')),
    )
    expect(initialBudget).toEqual({ limit: 2, used: 0, reserved: 0, available: 2 })
    const first = siteInvitationDtoSchema.parse(
      await responseJson(owner.post('/api/me/invitations', { email: emails[0] })),
    )
    const second = siteInvitationDtoSchema.parse(
      await responseJson(owner.post('/api/me/invitations', { email: emails[1] })),
    )
    expect(
      await responseStatus(owner.post('/api/me/invitations', { email: 'third@example.test' })),
    ).toBe(409)
    expect(
      await responseStatus(owner.request(`/api/me/invitations/${first.id}`, { method: 'DELETE' })),
    ).toBe(204)
    expect(await responseStatus(owner.post('/api/me/invitations', { email: emails[0] }))).toBe(201)
    for (const email of emails) {
      const token = new URL(
        findLink(harness.mailbox, email, '/signup?invitation='),
        'http://localhost:5273',
      ).searchParams.get('invitation')
      if (token === null) throw new Error('Missing fixture invitation')
      const { client, response } = await signup(harness, email, token)
      expect(response.status).toBe(200)
      await client.get(findLink(harness.mailbox, email, '/api/auth/verify-email'))
      const admittedSession = sessionSchema.parse(
        await responseJson(client.get('/api/auth/get-session')),
      )
      expect(admittedSession.user.membershipCohort).toBe('private')
      await client.signIn({ ...OTHER, email })
      expect(
        await responseStatus(client.post('/api/me/invitations', { email: `child-${email}` })),
      ).toBe(201)
      expect(
        await responseStatus(
          client.post('/api/me/invitations', { email: `second-child-${email}` }),
        ),
      ).toBe(201)
      expect(
        await responseStatus(client.post('/api/me/invitations', { email: `third-child-${email}` })),
      ).toBe(409)
    }
    expect(
      await responseStatus(owner.request(`/api/me/invitations/${second.id}`, { method: 'DELETE' })),
    ).toBe(404)
    expect(await responseStatus(owner.post('/api/me/referral-link/rotate', {}))).toBe(200)
    const link = await harness.services.accounts.findReferralLink(ownerId)
    if (link === null) throw new Error('Missing fixture referral')
    expect(
      await harness.services.accounts.pendingInvitation(link.tokenHash, 'third@example.test'),
    ).toBeNull()
    expect(
      await responseStatus(owner.post('/api/me/invitations', { email: 'third@example.test' })),
    ).toBe(409)
    await context.adapter.delete({ model: 'user', where: [{ field: 'email', value: emails[0] }] })
    expect(
      await responseStatus(owner.post('/api/me/invitations', { email: 'third@example.test' })),
    ).toBe(409)
    const spent = await harness.services.accounts.listInvitations(ownerId)
    expect(spent.filter((record) => record.acceptedAt !== null)).toHaveLength(
      SITE_INVITATION_POLICY.newAdmissions,
    )
    const finalBudget = privateInvitationBudgetSchema.parse(
      await responseJson(owner.get('/api/me/private-invitation-budget')),
    )
    expect(finalBudget).toEqual({ limit: 2, used: 2, reserved: 0, available: 0 })
  })
})
