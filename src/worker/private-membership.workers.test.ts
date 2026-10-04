import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import type { SiteInvitationRecord } from './account-store'
import { MEMBERSHIP_COHORT, SITE_INVITATION_POLICY } from '../shared/api-accounts'
import { invitationTokenHash } from './auth/invitation-admission'
import { siteInvitation, user } from './db/schema'
import { getServices } from './services'

const services = getServices(env)
const policy = { expiryOffsetMs: 60_000, raceRequests: 6 }

async function inviter(cohort: 'private' | 'public' = MEMBERSHIP_COHORT.private) {
  const id = crypto.randomUUID()
  await services.db.insert(user).values({
    id,
    name: 'Membership fixture',
    email: `${id}@example.test`,
    emailVerified: true,
    role: 'user',
    membershipCohort: cohort,
  })
  const link = await services.accounts.saveReferralLink(
    {
      id: `link-${id}`,
      userId: id,
      nonce: crypto.randomUUID(),
      tokenHash: await invitationTokenHash(`link-${id}`),
      createdAt: new Date(),
      revokedAt: null,
    },
    false,
  )
  return { id, link }
}

function invitation(
  inviterId: string,
  expiresAt = new Date(Date.now() + policy.expiryOffsetMs),
): SiteInvitationRecord {
  const id = crypto.randomUUID()
  return {
    id,
    inviterId,
    email: `${id}@example.test`,
    role: 'user',
    tokenHash: id,
    createdAt: new Date(),
    expiresAt,
    acceptedAt: null,
    acceptedUserId: null,
    revokedAt: null,
  }
}

async function pendingAccount(email: string) {
  const id = crypto.randomUUID()
  await services.db
    .insert(user)
    .values({ id, email, name: 'Pending fixture', emailVerified: false, role: 'user' })
  return id
}

describe('private membership D1 transactions', () => {
  it('shares exactly two reservations across competing targeted and reusable requests', async () => {
    const actor = await inviter()
    const results = await Promise.all(
      Array.from({ length: policy.raceRequests }, async (_, index) => {
        if (index % 2 === 0) return await services.accounts.createInvitation(invitation(actor.id))
        const reserved = await services.accounts.pendingInvitation(
          actor.link.tokenHash,
          `race-${String(index)}@example.test`,
        )
        return reserved !== null
      }),
    )
    expect(results.filter(Boolean)).toHaveLength(SITE_INVITATION_POLICY.newAdmissions)
    expect(results.filter((created) => !created)).toHaveLength(
      policy.raceRequests - SITE_INVITATION_POLICY.newAdmissions,
    )
    expect(await services.accounts.invitationBudget(actor.id)).toEqual({
      limit: 2,
      used: 0,
      reserved: 2,
      available: 0,
    })
    expect(await services.accounts.createInvitation(invitation(actor.id))).toBe(false)
    expect(
      await services.accounts.pendingInvitation(actor.link.tokenHash, 'overflow@example.test'),
    ).toBeNull()
  })

  it('keeps accepted grants spent after invitee deletion, link rotation and replay', async () => {
    const actor = await inviter()
    const targeted = invitation(actor.id)
    expect(await services.accounts.createInvitation(targeted)).toBe(true)
    const referred = await services.accounts.pendingInvitation(
      actor.link.tokenHash,
      'referred@example.test',
    )
    if (referred === null) throw new Error('Missing bounded referral fixture')
    const targetedUser = await pendingAccount(targeted.email)
    const referredUser = await pendingAccount(referred.email)
    const admissions = await Promise.all([
      services.accounts.acceptInvitation(targeted.tokenHash, targeted.email, targetedUser),
      services.accounts.acceptInvitation(actor.link.tokenHash, referred.email, referredUser),
    ])
    expect(admissions).toEqual([true, true])
    expect(
      await services.accounts.acceptInvitation(targeted.tokenHash, targeted.email, targetedUser),
    ).toBe(false)
    const admitted = await services.db.select().from(user).where(eq(user.id, targetedUser))
    expect(admitted[0]?.membershipCohort).toBe('private')
    expect(await services.accounts.invitationBudget(actor.id)).toEqual({
      limit: 2,
      used: 2,
      reserved: 0,
      available: 0,
    })
    await services.db.delete(user).where(eq(user.id, targetedUser))
    await services.accounts.saveReferralLink(
      { ...actor.link, nonce: 'rotated-fixture', tokenHash: 'rotated-fixture-hash' },
      true,
    )
    expect(await services.accounts.createInvitation(invitation(actor.id))).toBe(false)
    expect(
      await services.accounts.pendingInvitation('rotated-fixture-hash', 'overflow@example.test'),
    ).toBeNull()
    const accepted = await services.db
      .select()
      .from(siteInvitation)
      .where(eq(siteInvitation.id, targeted.id))
    expect(accepted[0]?.acceptedUserId).toBeNull()
    expect(accepted[0]?.acceptedAt).not.toBeNull()
  })

  it('releases unused targeted/referral reservations on expiry, revocation and rotation', async () => {
    const actor = await inviter()
    const expired = invitation(actor.id, new Date(Date.now() - policy.expiryOffsetMs))
    expect(await services.accounts.createInvitation(expired)).toBe(true)
    expect(await services.accounts.pendingInvitation(expired.tokenHash, expired.email)).toBeNull()
    const targeted = invitation(actor.id)
    expect(await services.accounts.createInvitation(targeted)).toBe(true)
    expect(
      await services.accounts.pendingInvitation(actor.link.tokenHash, 'unused@example.test'),
    ).not.toBeNull()
    expect(await services.accounts.createInvitation(invitation(actor.id))).toBe(false)
    expect(await services.accounts.revokeInvitation(actor.id, targeted.id)).toBe(true)
    expect(await services.accounts.createInvitation(invitation(actor.id))).toBe(true)
    await services.accounts.revokeReferralLink(actor.id)
    expect(
      await services.accounts.pendingInvitation(actor.link.tokenHash, 'unused@example.test'),
    ).toBeNull()
    expect(await services.accounts.invitationBudget(actor.id)).toEqual({
      limit: 2,
      used: 0,
      reserved: 1,
      available: 1,
    })
    const rotated = await services.accounts.saveReferralLink(
      { ...actor.link, nonce: 'new-fixture', tokenHash: 'new-fixture-hash' },
      true,
    )
    expect(
      await services.accounts.pendingInvitation(rotated.tokenHash, 'new@example.test'),
    ).not.toBeNull()
    expect(await services.accounts.invitationBudget(actor.id)).toEqual({
      limit: 2,
      used: 0,
      reserved: 2,
      available: 0,
    })
  })

  it('excludes historical spend and denies public inviters or already-admitted recipients', async () => {
    const actor = await inviter()
    await services.db
      .insert(siteInvitation)
      .values({ ...invitation(actor.id), grantVersion: 0, acceptedAt: new Date() })
    expect(await services.accounts.invitationBudget(actor.id)).toEqual({
      limit: 2,
      used: 0,
      reserved: 0,
      available: 2,
    })
    const publicActor = await inviter('public')
    expect(await services.accounts.createInvitation(invitation(publicActor.id))).toBe(false)
    expect(
      await services.accounts.pendingInvitation(publicActor.link.tokenHash, 'private@example.test'),
    ).toBeNull()
    const offer = invitation(actor.id)
    expect(await services.accounts.createInvitation(offer)).toBe(true)
    const recipient = await pendingAccount(offer.email)
    await services.accounts.activateAccount(recipient, 'public')
    expect(await services.accounts.acceptInvitation(offer.tokenHash, offer.email, recipient)).toBe(
      false,
    )
    expect(await services.accounts.pendingInvitation(offer.tokenHash, offer.email)).not.toBeNull()
    const row = await services.db.select().from(user).where(eq(user.id, recipient))
    expect(row[0]?.membershipCohort).toBe('public')
    await expect(services.accounts.activateAccount(recipient, 'private')).rejects.toThrow(
      'Account admission was not activated',
    )
  })
})
