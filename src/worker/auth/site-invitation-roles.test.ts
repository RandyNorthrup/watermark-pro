/** Site invitations grant only their stored, still-authorized role after real mailbox verification. */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { invitationTokenHash } from './invitation-admission'
import { siteInvitationDtoSchema } from '../../shared/api-accounts'
import { INVITATION_HEADER } from '../../shared/invitation'
import type { AssignableSiteRole } from '../../shared/site-roles'
import { findLink, TestClient } from '../test-support/client'
import { seedInviter } from '../test-support/inviter'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness, TEST_APP_URL } from '../test-support/test-app'

const password = 'invited role fixture passphrase'
const sessionSchema = z.object({ user: z.object({ id: z.string(), role: z.string() }) })

async function setup(role: AssignableSiteRole) {
  const harness = createTestHarness({ invitationOnly: true })
  const context = await harness.services.auth.$context
  await seedInviter(harness, 'bootstrap')
  await harness.services.users.promoteToSiteOwner('bootstrap@example.test')
  const token = 'initial-manager-admission'
  await harness.services.accounts.createInvitation({
    role: role === 'admin' ? 'admin' : 'user',
    id: 'initial-manager',
    inviterId: 'bootstrap',
    email: 'manager@example.test',
    tokenHash: await invitationTokenHash(token),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    acceptedUserId: null,
    revokedAt: null,
  })
  const actor = new TestClient(harness.app, harness.env)
  const registered = await actor.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [INVITATION_HEADER]: token },
    body: JSON.stringify({ name: 'Manager', email: 'manager@example.test', password }),
  })
  expect(registered.status).toBe(200)
  await actor.get(findLink(harness.mailbox, 'manager@example.test', '/api/auth/verify-email'))
  const actorId = sessionSchema.parse(await responseJson(actor.get('/api/auth/get-session'))).user
    .id
  return { harness, context, actor, actorId }
}

async function accept(
  fixture: Awaited<ReturnType<typeof setup>>,
  email: string,
  extra: Record<string, unknown> = {},
) {
  const link = new URL(findLink(fixture.harness.mailbox, email, '/signup'), TEST_APP_URL)
  const token = link.searchParams.get('invitation')
  if (token === null) throw new Error('Fixture invitation is missing')
  const client = new TestClient(fixture.harness.app, fixture.harness.env)
  const response = await client.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [INVITATION_HEADER]: token },
    body: JSON.stringify({ name: 'Invitee', email, password, ...extra }),
  })
  return { client, response }
}

describe('site invitation roles', () => {
  it.each(['admin', 'user'] as const)(
    'an %s can invite ordinary users without granting its own role or workspace',
    async (role) => {
      const fixture = await setup(role)
      const { actor, harness } = fixture
      const invited = await actor.post('/api/me/invitations', {
        email: 'ordinary-invitee@example.test',
      })
      expect(invited.status).toBe(201)
      expect(siteInvitationDtoSchema.parse(await invited.json()).role).toBe('user')
      const { client, response } = await accept(fixture, 'ordinary-invitee@example.test')
      expect(response.status).toBe(200)
      await client.get(
        findLink(harness.mailbox, 'ordinary-invitee@example.test', '/api/auth/verify-email'),
      )
      const current = await responseJson(client.get('/api/auth/get-session'))
      expect(sessionSchema.parse(current).user.role).toBe('user')
      expect(await responseStatus(client.get('/api/admin/account-stats'))).toBe(403)
      expect(await fixture.context.adapter.count({ model: 'member' })).toBe(0)
    },
  )

  it('lets an administrator invite another administrator but creates only its private workspace', async () => {
    const fixture = await setup('admin')
    const invited = await fixture.actor.post('/api/me/invitations', {
      email: 'admin-invitee@example.test',
      role: 'admin',
    })
    expect(invited.status).toBe(201)
    expect(siteInvitationDtoSchema.parse(await invited.json()).role).toBe('admin')
    const forged = await accept(fixture, 'admin-invitee@example.test', { role: 'owner' })
    expect(forged.response.status).toBe(400)
    expect(await fixture.context.adapter.count({ model: 'user' })).toBe(2)
    const { client, response } = await accept(fixture, 'admin-invitee@example.test')
    expect(response.status).toBe(200)
    expect(await responseStatus(client.get('/api/admin/account-stats'))).toBe(401)
    await client.get(
      findLink(fixture.harness.mailbox, 'admin-invitee@example.test', '/api/auth/verify-email'),
    )
    const invitedUser = sessionSchema.parse(
      await responseJson(client.get('/api/auth/get-session')),
    ).user
    expect(invitedUser.role).toBe('admin')
    expect(await responseStatus(client.get('/api/admin/account-stats'))).toBe(200)
    expect(await fixture.context.adapter.count({ model: 'member' })).toBe(0)
    expect(await responseStatus(client.post('/api/me/workspace', {}))).toBe(200)
    const membership = await fixture.context.adapter.findMany({ model: 'member' })
    expect(membership).toMatchObject([
      { userId: invitedUser.id, role: 'owner', organizationId: `personal-${invitedUser.id}` },
    ])
  })

  it.each(['admin', 'owner', 'editor', 'user,admin'])(
    'an ordinary user cannot invite role %s',
    async (role) => {
      const { actor, harness } = await setup('user')
      const before = harness.mailbox.messages().length
      const response = await actor.post('/api/me/invitations', {
        email: 'rejected@example.test',
        role,
      })
      expect(response.status).toBe(role === 'admin' ? 403 : 400)
      expect(harness.mailbox.messages()).toHaveLength(before)
    },
  )

  it('refuses an administrator invitation after demotion while ordinary invitations remain usable', async () => {
    const fixture = await setup('admin')
    for (const role of ['user', 'admin'])
      expect(
        await responseStatus(
          fixture.actor.post('/api/me/invitations', {
            email: `${role}-pending@example.test`,
            role,
          }),
        ),
      ).toBe(201)
    // Simulate a concurrent authoritative role change; pending checks must not rely on a stale session.
    await fixture.context.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: fixture.actorId }],
      update: { role: 'user' },
    })
    const refused = await accept(fixture, 'admin-pending@example.test')
    expect(refused.response.status).toBe(403)
    const allowed = await accept(fixture, 'user-pending@example.test')
    expect(allowed.response.status).toBe(200)
    expect(await fixture.context.adapter.count({ model: 'user' })).toBe(3)
  })
})
