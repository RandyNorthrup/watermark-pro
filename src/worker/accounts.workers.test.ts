import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from './index'
import { getServices } from './services'
import {
  accountStatsSchema,
  privateWorkspaceSchema,
  SITE_INVITATION_POLICY,
  siteInvitationDtoSchema,
  siteInvitationListSchema,
} from '../shared/api-accounts'
import { BOOTSTRAP_PATH, bootstrapSnapshotSchema } from '../shared/bootstrap'
import { INVITATION_HEADER } from '../shared/invitation'
import { invitationTokenHash } from './auth/invitation-admission'
import { user, siteInvitation, referralLink } from './db/schema'
import { TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'

const OWNER = {
  name: 'D1 Alice',
  email: 'd1-alice@example.test',
  password: 'long d1 alice password',
}
const OTHER = { name: 'D1 Bob', email: 'd1-bob@example.test', password: 'long d1 bob password' }
const app = createApp()
const services = getServices(env)
const owner = new TestClient(app, env)
const other = new TestClient(app, env)

beforeAll(async () => {
  const mailbox = services.devMailbox
  if (mailbox === undefined) throw new Error('Expected isolated console email provider')
  await owner.signUpAndVerify(mailbox, OWNER)
  await other.signUpAndVerify(mailbox, OTHER)
})

describe('private account D1 wiring', () => {
  it('revokes banned inviters admissions and cascades invitations when the inviter is deleted', async () => {
    const id = 'd1-abuse-inviter'
    const email = 'd1-abuse-recipient@example.test'
    await services.db.insert(user).values({
      id,
      name: 'Inviter fixture',
      email: 'd1-abuse-inviter@example.test',
      emailVerified: true,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const targetHash = await invitationTokenHash('d1-targeted-ban-token')
    const linkHash = await invitationTokenHash('d1-referral-ban-token')
    const expiresAt = new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs)
    expect(
      await services.accounts.createInvitation({
        role: 'user',
        id: 'd1-abuse-targeted',
        inviterId: id,
        email,
        tokenHash: targetHash,
        createdAt: new Date(),
        expiresAt,
        acceptedAt: null,
        acceptedUserId: null,
        revokedAt: null,
      }),
    ).toBe(true)
    await services.accounts.saveReferralLink(
      {
        id: 'd1-abuse-referral',
        userId: id,
        nonce: 'fixture-nonce',
        tokenHash: linkHash,
        createdAt: new Date(),
        revokedAt: null,
      },
      false,
    )
    expect(await services.accounts.pendingInvitation(targetHash, email)).not.toBeNull()
    expect(await services.accounts.pendingInvitation(linkHash, email)).not.toBeNull()
    await services.db.update(user).set({ banned: true }).where(eq(user.id, id))
    expect(await services.accounts.pendingInvitation(targetHash, email)).toBeNull()
    expect(await services.accounts.pendingInvitation(linkHash, email)).toBeNull()
    await services.accounts.revokePendingAdmissions(id)
    await services.db.update(user).set({ banned: false }).where(eq(user.id, id))
    expect(await services.accounts.pendingInvitation(targetHash, email)).toBeNull()
    expect(await services.accounts.pendingInvitation(linkHash, email)).toBeNull()
    const links = await services.db.select().from(referralLink).where(eq(referralLink.userId, id))
    expect(links[0]?.revokedAt).not.toBeNull()
    await services.db.delete(user).where(eq(user.id, id))
    expect(
      await services.db.select().from(siteInvitation).where(eq(siteInvitation.inviterId, id)),
    ).toEqual([])
    expect(
      await services.db.select().from(referralLink).where(eq(referralLink.userId, id)),
    ).toEqual([])
    expect(await services.accounts.pendingInvitation(targetHash, email)).toBeNull()
    expect(await services.accounts.pendingInvitation(linkHash, email)).toBeNull()
  })
  it('atomically provisions one personal organization and owner per account under concurrent requests', async () => {
    const results = await Promise.all([
      owner.post('/api/me/workspace', {}),
      owner.post('/api/me/workspace', {}),
      other.post('/api/me/workspace', {}),
    ])
    expect(results.map((response) => response.status)).toEqual([200, 200, 200])
    const [alice, repeated, bob] = await Promise.all(
      results.map(async (response) => privateWorkspaceSchema.parse(await response.json())),
    )
    expect(alice).toEqual(repeated)
    expect(alice).not.toEqual(bob)
    const members = await services.db.query.member.findMany()
    const mappings = await services.db.query.privateWorkspace.findMany()
    expect(members).toHaveLength(2)
    expect(mappings).toHaveLength(2)
    for (const mapping of mappings) {
      expect(
        members.filter((member) => member.organizationId === mapping.organizationId),
      ).toMatchObject([{ userId: mapping.userId, role: 'owner' }])
    }
    const [aliceBootstrap, bobBootstrap] = await Promise.all([
      responseJson(owner.post(BOOTSTRAP_PATH, {})),
      responseJson(other.post(BOOTSTRAP_PATH, {})),
    ])
    const aliceSnapshot = bootstrapSnapshotSchema.parse(aliceBootstrap)
    const bobSnapshot = bootstrapSnapshotSchema.parse(bobBootstrap)
    expect(aliceSnapshot.organization?.id).toBe(alice?.organizationId)
    expect(bobSnapshot.organization?.id).toBe(bob?.organizationId)
    expect(aliceSnapshot.role).toEqual({ role: 'owner' })
    expect(bobSnapshot.role).toEqual({ role: 'owner' })
    expect(aliceSnapshot.organizations).toHaveLength(1)
    expect(JSON.stringify(aliceSnapshot)).not.toContain(OTHER.email)
    expect(JSON.stringify(bobSnapshot)).not.toContain(OWNER.email)
    expect(await services.db.query.privateWorkspace.findMany()).toHaveLength(2)
  })
  it('persists only token hashes and enforces owner-scoped revocation and aggregate access', async () => {
    const response = await owner.post('/api/me/invitations', { email: 'recipient@example.test' })
    expect(response.status).toBe(201)
    const dto = siteInvitationDtoSchema.parse(await response.json())
    const records = await services.db.query.siteInvitation.findMany()
    expect(records).toHaveLength(1)
    expect(records[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(
      await responseStatus(other.request(`/api/me/invitations/${dto.id}`, { method: 'DELETE' })),
    ).toBe(404)
    const otherInvitations = siteInvitationListSchema.parse(
      await responseJson(other.get('/api/me/invitations')),
    )
    expect(otherInvitations.invitations).toEqual([])
    expect(await responseStatus(owner.get('/api/admin/account-stats'))).toBe(403)
    await services.users.promoteToSiteOwner(OWNER.email)
    const statistics = accountStatsSchema.parse(
      await responseJson(owner.get('/api/admin/account-stats')),
    )
    expect(statistics).toEqual({
      users: 2,
      verifiedUsers: 2,
      pendingInvitations: 1,
      acceptedInvitations: 0,
    })
    expect(
      await responseStatus(owner.request(`/api/me/invitations/${dto.id}`, { method: 'DELETE' })),
    ).toBe(204)
    expect(
      await services.accounts.pendingInvitation(
        records[0]?.tokenHash ?? '',
        'recipient@example.test',
      ),
    ).toBeNull()
  })
  it.each(['user', 'admin'] as const)(
    'consumes a %s site admission in real auth without inviter access',
    async (role) => {
      const ownerUser = await services.db.query.user.findFirst({
        where: (user, { eq }) => eq(user.email, OWNER.email),
      })
      if (ownerUser === undefined) throw new Error('Missing verified fixture user')
      if (role === 'admin') expect(await services.users.promoteToSiteOwner(OWNER.email)).toBe(true)
      const token = `d1-private-admission-token-${role}`
      const email = `d1-invited-${role}@example.test`
      await services.accounts.createInvitation({
        role,
        id: crypto.randomUUID(),
        inviterId: ownerUser.id,
        email,
        tokenHash: await invitationTokenHash(token),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs),
        acceptedAt: null,
        acceptedUserId: null,
        revokedAt: null,
      })
      const invited = new TestClient(app, env)
      const body = JSON.stringify({
        name: 'Invited',
        email,
        password: 'a long invitation password',
      })
      expect(
        await responseStatus(
          invited.request('/api/auth/sign-up/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json', [INVITATION_HEADER]: token },
            body,
          }),
        ),
      ).toBe(200)
      expect(
        await services.accounts.pendingInvitation(await invitationTokenHash(token), email),
      ).toBeNull()
      const invitedUser = await services.db.query.user.findFirst({
        where: (user, { eq }) => eq(user.email, email),
      })
      expect(invitedUser?.emailVerified).toBe(false)
      expect(invitedUser?.role).toBe(role)
      const memberships = await services.db.query.member.findMany()
      expect(memberships.filter((member) => member.userId === invitedUser?.id)).toEqual([])
    },
  )
  it('enforces the send quota atomically for concurrent D1 inserts', async () => {
    const ownerUser = await services.db.query.user.findFirst({
      where: (user, { eq }) => eq(user.email, OTHER.email),
    })
    if (ownerUser === undefined) throw new Error('Missing verified fixture user')
    const excessRequests = 3
    const results = await Promise.all(
      Array.from(
        { length: SITE_INVITATION_POLICY.sendsPerWindow + excessRequests },
        async () =>
          await services.accounts.createInvitation({
            role: 'user',
            id: crypto.randomUUID(),
            inviterId: ownerUser.id,
            email: OTHER.email,
            tokenHash: crypto.randomUUID(),
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs),
            acceptedAt: null,
            acceptedUserId: null,
            revokedAt: null,
          }),
      ),
    )
    expect(results.filter(Boolean)).toHaveLength(SITE_INVITATION_POLICY.sendsPerWindow)
    expect(results.filter((wasCreated) => !wasCreated)).toHaveLength(excessRequests)
  })
})
