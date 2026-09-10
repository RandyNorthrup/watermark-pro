import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  accountStatsSchema,
  privateWorkspaceSchema,
  SITE_INVITATION_POLICY,
  siteInvitationDtoSchema,
  siteInvitationListSchema,
} from '../../shared/api-accounts'
import { INVITATION_HEADER } from '../../shared/invitation'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import { invitationTokenHash } from '../auth/invitation-admission'
import { findLink, joinAsMember, signUpOwner, TestClient } from '../test-support/client'
import { seedInviter } from '../test-support/inviter'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness, type TestHarness } from '../test-support/test-app'

const OWNER = { name: 'Alice', email: 'alice@example.test', password: 'a long password for alice' }
const OTHER = { name: 'Bob', email: 'bob@example.test', password: 'a long password for bob' }
const ROLE_CASES = ['owner', 'admin', 'editor', 'viewer', 'non-member'] as const
const userIdSchema = z.object({ user: z.object({ id: z.string() }) })

async function idOf(client: TestClient) {
  return userIdSchema.parse(await responseJson(client.get('/api/auth/get-session'))).user.id
}
async function ownWorkspace(client: TestClient) {
  const response = await client.post('/api/me/workspace', {})
  expect(response.status).toBe(200)
  return privateWorkspaceSchema.parse(await response.json()).organizationId
}
async function verifiedInvitedUser(harness: TestHarness, token: string) {
  const client = new TestClient(harness.app, harness.env)
  const signup = await client.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [INVITATION_HEADER]: token },
    body: JSON.stringify({ ...OTHER, callbackURL: '/app' }),
  })
  expect(signup.status).toBe(200)
  expect(await responseStatus(client.post('/api/auth/sign-in/email', OTHER))).toBe(403)
  expect(
    await responseStatus(
      client.post('/api/auth/send-verification-email', { email: OTHER.email, callbackURL: '/app' }),
    ),
  ).toBe(200)
  const url = findLink(harness.mailbox, OTHER.email, '/api/auth/verify-email')
  expect(await responseStatus(client.get(url))).toBeLessThan(400)
  return client
}

describe('site invitations and private workspaces', () => {
  it.each(ROLE_CASES)(
    'lets a %s invite to the site without workspace membership grants',
    async (role) => {
      const harness = createTestHarness()
      const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
        name: 'Shared',
        slug: 'shared',
      })
      let client = owner
      if (role === 'non-member') {
        client = new TestClient(harness.app, harness.env)
        await client.signUpAndVerify(harness.mailbox, OTHER)
      } else if (role !== 'owner')
        client = await joinAsMember(harness, owner, organizationId, OTHER, role)
      const response = await client.post('/api/me/invitations', { email: 'new@example.test' })
      expect(response.status).toBe(201)
      const invitation = siteInvitationDtoSchema.parse(await response.json())
      const sent = siteInvitationListSchema.parse(
        await responseJson(client.get('/api/me/invitations')),
      )
      expect(sent.invitations.map((record) => record.id)).toContain(invitation.id)
      expect(JSON.stringify(sent)).not.toContain('tokenHash')
      expect(await responseStatus(client.get('/api/admin/account-stats'))).toBe(403)
    },
  )
  it('round-trips invite, verification, resend and private provisioning; denies cross-account data', async () => {
    const harness = createTestHarness({ invitationOnly: true })
    const context = await harness.services.auth.$context
    const token = 'owner-fixture-token'
    await seedInviter(harness, 'bootstrap')
    await harness.services.accounts.createInvitation({
      id: 'seed',
      tokenHash: await invitationTokenHash(token),
      inviterId: 'bootstrap',
      email: OWNER.email,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs),
      acceptedAt: null,
      acceptedUserId: null,
      revokedAt: null,
    })
    const owner = new TestClient(harness.app, harness.env)
    const ownerBody = JSON.stringify(OWNER)
    expect(
      await responseStatus(
        owner.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json', [INVITATION_HEADER]: token },
          body: ownerBody,
        }),
      ),
    ).toBe(200)
    await owner.get(findLink(harness.mailbox, OWNER.email, '/api/auth/verify-email'))
    const reserved = await owner.post('/api/auth/organization/create', {
      name: 'Reserved fixture',
      slug: 'personal-someone',
    })
    expect(reserved.status).toBe(400)
    const ownerOrg = await ownWorkspace(owner)
    expect(
      await responseStatus(
        owner.post(`/api/orgs/${ownerOrg}/watermarks`, {
          name: 'Private canary preset',
          spec: DEFAULT_TEXT_SPEC,
        }),
      ),
    ).toBe(201)
    const sent = await owner.post('/api/me/invitations', { email: OTHER.email })
    expect(sent.status).toBe(201)
    const invite = siteInvitationDtoSchema.parse(await sent.json())
    const path = findLink(harness.mailbox, OTHER.email, '/signup?invitation=')
    const invitedToken = new URL(path, 'http://localhost:5273').searchParams.get('invitation')
    if (invitedToken === null) throw new Error('Missing fixture invitation')
    const other = await verifiedInvitedUser(harness, invitedToken)
    const otherOrg = await ownWorkspace(other)
    expect(otherOrg).not.toBe(ownerOrg)
    expect(await ownWorkspace(other)).toBe(otherOrg)
    expect(await responseStatus(other.get(`/api/orgs/${ownerOrg}/watermarks`))).toBe(403)
    expect(await responseStatus(owner.get(`/api/orgs/${otherOrg}/watermarks`))).toBe(403)
    expect(await responseJson(other.get(`/api/orgs/${otherOrg}/watermarks`))).toEqual({
      watermarks: [],
    })
    expect(await responseJson(other.get('/api/me/invitations'))).toEqual({ invitations: [] })
    expect(
      await responseStatus(other.request(`/api/me/invitations/${invite.id}`, { method: 'DELETE' })),
    ).toBe(404)
    expect(
      await responseStatus(
        other.post('/api/auth/organization/set-active', { organizationId: ownerOrg }),
      ),
    ).toBe(403)
    expect(
      await responseStatus(
        owner.post('/api/auth/organization/invite-member', {
          organizationId: ownerOrg,
          email: OTHER.email,
          role: 'editor',
        }),
      ),
    ).toBe(403)
    expect(
      await responseStatus(
        owner.post('/api/auth/organization/delete', { organizationId: ownerOrg }),
      ),
    ).toBe(403)
    await context.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: await idOf(owner) }],
      update: { role: 'admin' },
    })
    const otherUserId = await idOf(other)
    expect(
      await responseStatus(owner.post('/api/auth/admin/impersonate-user', { userId: otherUserId })),
    ).toBe(403)
    const stats = accountStatsSchema.parse(
      await responseJson(owner.get('/api/admin/account-stats')),
    )
    expect(stats).toEqual({
      users: 3,
      verifiedUsers: 3,
      pendingInvitations: 0,
      acceptedInvitations: 2,
    })
    expect(await responseStatus(other.get('/api/admin/account-stats'))).toBe(403)
  })
  it('rejects anonymous calls and invalid fields without sending mail', async () => {
    const harness = createTestHarness()
    const anonymous = new TestClient(harness.app, harness.env)
    for (const path of ['/api/me/invitations', '/api/admin/account-stats'])
      expect(await responseStatus(anonymous.get(path))).toBe(401)
    for (const path of ['/api/me/invitations', '/api/me/workspace'])
      expect(await responseStatus(anonymous.post(path, {}))).toBe(401)
    const { client } = await signUpOwner(harness, OWNER, { name: 'Owned', slug: 'owned' })
    const before = harness.mailbox.messages().length
    expect(await responseStatus(client.post('/api/me/invitations', { email: 'invalid' }))).toBe(400)
    expect(
      await responseStatus(
        client.post('/api/me/invitations', { email: OTHER.email, inviterId: 'another-user' }),
      ),
    ).toBe(400)
    expect(harness.mailbox.messages()).toHaveLength(before)
  })
  it('enforces per-inviter quota and revokes only the sender’s pending invitation', async () => {
    const harness = createTestHarness()
    const { client } = await signUpOwner(harness, OWNER, { name: 'Owned', slug: 'owned' })
    const first = siteInvitationDtoSchema.parse(
      await responseJson(client.post('/api/me/invitations', { email: OTHER.email })),
    )
    expect(
      await responseStatus(client.request(`/api/me/invitations/${first.id}`, { method: 'DELETE' })),
    ).toBe(204)
    expect(
      await responseStatus(client.request(`/api/me/invitations/${first.id}`, { method: 'DELETE' })),
    ).toBe(404)
    for (let index = 1; index < SITE_INVITATION_POLICY.sendsPerWindow; index++)
      expect(await responseStatus(client.post('/api/me/invitations', { email: OTHER.email }))).toBe(
        201,
      )
    const limited = await client.post('/api/me/invitations', { email: OTHER.email })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe(
      String(SITE_INVITATION_POLICY.sendWindowSeconds),
    )
  })
  it('revokes a newly created token if delivery fails', async () => {
    const harness = createTestHarness()
    const { client } = await signUpOwner(harness, OWNER, { name: 'Owned', slug: 'owned' })
    vi.spyOn(harness.services.email, 'send').mockRejectedValueOnce(
      new Error('delivery unavailable'),
    )
    expect(await responseStatus(client.post('/api/me/invitations', { email: OTHER.email }))).toBe(
      500,
    )
    const listed = siteInvitationListSchema.parse(
      await responseJson(client.get('/api/me/invitations')),
    )
    expect(listed.invitations[0]?.status).toBe('revoked')
  })
})
