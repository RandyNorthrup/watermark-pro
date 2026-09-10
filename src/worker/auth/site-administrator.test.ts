import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { invitationTokenHash } from './invitation-admission'
import { SITE_INVITATION_POLICY } from '../../shared/api-accounts'
import { signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness, type TestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Site Owner',
  email: 'site-owner@example.test',
  password: 'a site owner passphrase',
}
const OTHER = {
  name: 'Private User',
  email: 'private-user@example.test',
  password: 'a private user passphrase',
}
const sessionIdSchema = z.object({ user: z.object({ id: z.string() }) })
let harness: TestHarness
let owner: TestClient
let other: TestClient
let ownerId: string
let otherId: string

beforeEach(async () => {
  harness = createTestHarness()
  ;({ client: owner } = await signUpOwner(harness, OWNER, {
    name: 'Owner workspace',
    slug: 'owner-workspace',
  }))
  expect(await harness.services.users.promoteToSiteOwner(OWNER.email)).toBe(true)
  expect(await responseStatus(owner.get('/api/admin/account-stats'))).toBe(200)
  other = new TestClient(harness.app, harness.env)
  await other.signUpAndVerify(harness.mailbox, OTHER)
  ownerId = sessionIdSchema.parse(await responseJson(owner.get('/api/auth/get-session'))).user.id
  otherId = sessionIdSchema.parse(await responseJson(other.get('/api/auth/get-session'))).user.id
})

describe('protected site owner', () => {
  it('banning an inviter permanently revokes outstanding targeted and reusable admissions', async () => {
    const targetHash = await invitationTokenHash('targeted-ban-fixture')
    const referralHash = await invitationTokenHash('referral-ban-fixture')
    const email = 'new-invitee@example.test'
    await harness.services.accounts.createInvitation({
      role: 'user',
      id: 'targeted-ban',
      inviterId: otherId,
      email,
      tokenHash: targetHash,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs),
      acceptedAt: null,
      acceptedUserId: null,
      revokedAt: null,
    })
    await harness.services.accounts.saveReferralLink(
      {
        id: 'referral-ban',
        userId: otherId,
        nonce: 'fixture-nonce',
        tokenHash: referralHash,
        createdAt: new Date(),
        revokedAt: null,
      },
      false,
    )
    expect(await harness.services.accounts.pendingInvitation(targetHash, email)).not.toBeNull()
    expect(await harness.services.accounts.pendingInvitation(referralHash, email)).not.toBeNull()
    expect(
      await responseStatus(
        owner.post('/api/auth/admin/ban-user', { userId: otherId, banReason: 'Abuse fixture' }),
      ),
    ).toBe(200)
    expect(await harness.services.accounts.pendingInvitation(targetHash, email)).toBeNull()
    expect(await harness.services.accounts.pendingInvitation(referralHash, email)).toBeNull()
    expect(
      await responseStatus(owner.post('/api/auth/admin/unban-user', { userId: otherId })),
    ).toBe(200)
    expect(await harness.services.accounts.pendingInvitation(targetHash, email)).toBeNull()
    expect(await harness.services.accounts.pendingInvitation(referralHash, email)).toBeNull()
    const invitations = await harness.services.accounts.listInvitations(otherId)
    expect(invitations[0]?.revokedAt).not.toBeNull()
    const referral = await harness.services.accounts.findReferralLink(otherId)
    expect(referral?.revokedAt).not.toBeNull()
  })
  it.each(['owner', ['owner'], ['user', 'admin'], 'user,admin'])(
    'refuses promotion of another account with role %j',
    async (role) => {
      const response = await owner.post('/api/auth/admin/set-role', { userId: otherId, role })
      expect(response.status).toBe(403)
      expect(await responseStatus(other.get('/api/admin/account-stats'))).toBe(403)
      expect(await harness.services.users.promoteToSiteOwner(OTHER.email)).toBe(false)
    },
  )
  it.each([{ role: 'owner' }, { data: { role: 'owner' } }])(
    'refuses creating a second owner through either Better Auth role input %j',
    async (roleInput) => {
      const response = await owner.post('/api/auth/admin/create-user', {
        name: 'Extra Admin',
        email: 'extra@example.test',
        ...roleInput,
      })
      expect(response.status).toBe(403)
      const context = await harness.services.auth.$context
      expect(await context.adapter.count({ model: 'user' })).toBe(2)
    },
  )
  it('blocks nested role updates and account identity/password takeover shortcuts', async () => {
    for (const data of [
      { role: 'owner' },
      { email: OWNER.email },
      { emailVerified: true },
      { id: ownerId },
    ]) {
      expect(
        await responseStatus(owner.post('/api/auth/admin/update-user', { userId: otherId, data })),
      ).toBe(403)
    }
    expect(
      await responseStatus(
        owner.post('/api/auth/admin/set-user-password', {
          userId: otherId,
          newPassword: 'a replacement passphrase',
        }),
      ),
    ).toBe(403)
  })
  it('cannot demote, ban, remove, or re-identify the sole owner', async () => {
    for (const [path, body] of [
      ['/api/auth/admin/set-role', { userId: ownerId, role: 'user' }],
      ['/api/auth/admin/ban-user', { userId: ownerId, banReason: 'cannot ban owner' }],
      ['/api/auth/admin/remove-user', { userId: ownerId }],
      ['/api/auth/admin/update-user', { userId: ownerId, data: { banned: true } }],
    ] as const)
      expect(await responseStatus(owner.post(path, body))).toBe(403)
    expect(await responseStatus(owner.get('/api/admin/account-stats'))).toBe(200)
  })
  it('does not treat workspace ownership or an injected owner label as site authority', async () => {
    expect(await responseStatus(other.post('/api/me/workspace', {}))).toBe(200)
    expect(await responseStatus(other.get('/api/auth/admin/list-users'))).toBe(403)
    const context = await harness.services.auth.$context
    // The real D1 constraint prevents this corruption; the memory fixture proves
    // the HTTP boundary also refuses a forged owner label on an unanchored account.
    await context.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: otherId }],
      update: { role: 'owner' },
    })
    expect(await responseStatus(other.get('/api/admin/account-stats'))).toBe(403)
    expect(await responseStatus(other.get('/api/auth/admin/list-users'))).toBe(403)
  })
  it('keeps owner account administration and ordinary user creation available', async () => {
    expect(
      await responseStatus(
        owner.post('/api/auth/admin/set-role', { userId: ownerId, role: 'admin' }),
      ),
    ).toBe(403)
    const created = await owner.post('/api/auth/admin/create-user', {
      name: 'Ordinary User',
      email: 'ordinary@example.test',
      role: 'user',
      data: { role: 'user' },
    })
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ user: { role: 'user' } })
    expect(
      await responseStatus(
        owner.post('/api/auth/admin/ban-user', {
          userId: otherId,
          banReason: 'fixture moderation',
        }),
      ),
    ).toBe(200)
    expect(
      await responseStatus(owner.post('/api/auth/admin/unban-user', { userId: otherId })),
    ).toBe(200)
  })
})
