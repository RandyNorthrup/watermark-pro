import { describe, expect, it } from 'vitest'

import {
  referralLinkSchema,
  SITE_INVITATION_POLICY,
  siteInvitationListSchema,
} from '../../shared/api-accounts'
import { INVITATION_HEADER } from '../../shared/invitation'
import { invitationTokenHash } from '../auth/invitation-admission'
import { findLink, TestClient } from '../test-support/client'
import { seedInviter } from '../test-support/inviter'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Referrer',
  email: 'referrer@example.test',
  password: 'a long referrer password',
}
const OTHER = {
  name: 'Referral person',
  email: 'referral@example.test',
  password: 'a long referral password',
}

async function fixture() {
  const harness = createTestHarness({ invitationOnly: true })
  const owner = new TestClient(harness.app, harness.env)
  const token = 'bootstrap-referrer'
  await seedInviter(harness, 'fixture-operator')
  await harness.services.accounts.createInvitation({
    id: 'bootstrap',
    inviterId: 'fixture-operator',
    email: OWNER.email,
    tokenHash: await invitationTokenHash(token),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs),
    acceptedAt: null,
    acceptedUserId: null,
    revokedAt: null,
  })
  await owner.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [INVITATION_HEADER]: token },
    body: JSON.stringify(OWNER),
  })
  await owner.get(findLink(harness.mailbox, OWNER.email, '/api/auth/verify-email'))
  return { harness, owner }
}

function tokenFrom(url: string | null): string {
  if (url === null) throw new Error('Missing referral fixture URL')
  const token = new URL(url).searchParams.get('invitation')
  if (token === null) throw new Error('Missing referral fixture token')
  return token
}

describe('reusable private referral links', () => {
  it('creates a stable unique link, attributes signup, and exposes counts without referred identities', async () => {
    const { harness, owner } = await fixture()
    const link = referralLinkSchema.parse(
      await responseJson(owner.post('/api/me/referral-link', {})),
    )
    const repeat = referralLinkSchema.parse(
      await responseJson(owner.post('/api/me/referral-link', {})),
    )
    expect(repeat).toEqual(link)
    const other = new TestClient(harness.app, harness.env)
    const token = tokenFrom(link.url)
    const body = JSON.stringify(OTHER)
    expect(
      await responseStatus(
        other.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json', [INVITATION_HEADER]: token },
          body,
        }),
      ),
    ).toBe(200)
    const counted = referralLinkSchema.parse(
      await responseJson(owner.post('/api/me/referral-link', {})),
    )
    expect(counted.acceptedAccounts).toBe(1)
    expect(JSON.stringify(counted)).not.toContain(OTHER.email)
    expect(JSON.stringify(counted)).not.toContain(OTHER.name)
    const sent = siteInvitationListSchema.parse(
      await responseJson(owner.get('/api/me/invitations')),
    )
    expect(sent.invitations).toEqual([])
    await other.get(findLink(harness.mailbox, OTHER.email, '/api/auth/verify-email'))
    const otherLink = referralLinkSchema.parse(
      await responseJson(other.post('/api/me/referral-link', {})),
    )
    expect(otherLink.url).not.toBe(link.url)
    expect(otherLink.acceptedAccounts).toBe(0)
    const context = await harness.services.auth.$context
    expect(await context.adapter.count({ model: 'member' })).toBe(0)
  })
  it('rotation and revocation invalidate old tokens, including reservations, while preserving past counts', async () => {
    const { harness, owner } = await fixture()
    const link = referralLinkSchema.parse(
      await responseJson(owner.post('/api/me/referral-link', {})),
    )
    const oldHash = await invitationTokenHash(tokenFrom(link.url))
    expect(await harness.services.accounts.pendingInvitation(oldHash, OTHER.email)).not.toBeNull()
    const rotated = referralLinkSchema.parse(
      await responseJson(owner.post('/api/me/referral-link/rotate', {})),
    )
    expect(rotated.url).not.toBe(link.url)
    expect(await harness.services.accounts.pendingInvitation(oldHash, OTHER.email)).toBeNull()
    const rotatedHash = await invitationTokenHash(tokenFrom(rotated.url))
    expect(
      await harness.services.accounts.pendingInvitation(rotatedHash, OTHER.email),
    ).not.toBeNull()
    expect(await responseStatus(owner.request('/api/me/referral-link', { method: 'DELETE' }))).toBe(
      204,
    )
    expect(await harness.services.accounts.pendingInvitation(rotatedHash, OTHER.email)).toBeNull()
    const disabled = referralLinkSchema.parse(
      await responseJson(owner.post('/api/me/referral-link', {})),
    )
    expect(disabled.url).toBeNull()
  })
  it('reserves each email once and bounds reusable-link admissions per owner', async () => {
    const { harness, owner } = await fixture()
    const link = referralLinkSchema.parse(
      await responseJson(owner.post('/api/me/referral-link', {})),
    )
    const hash = await invitationTokenHash(tokenFrom(link.url))
    const repeated = await Promise.all([
      harness.services.accounts.pendingInvitation(hash, OTHER.email),
      harness.services.accounts.pendingInvitation(hash, OTHER.email.toUpperCase()),
    ])
    expect(repeated[0]?.id).toBe(repeated[1]?.id)
    for (let index = 1; index < SITE_INVITATION_POLICY.referralsPerDay; index++)
      expect(
        await harness.services.accounts.pendingInvitation(
          hash,
          `person-${String(index)}@example.test`,
        ),
      ).not.toBeNull()
    expect(
      await harness.services.accounts.pendingInvitation(hash, 'over-limit@example.test'),
    ).toBeNull()
    const rotated = referralLinkSchema.parse(
      await responseJson(owner.post('/api/me/referral-link/rotate', {})),
    )
    const rotatedHash = await invitationTokenHash(tokenFrom(rotated.url))
    expect(
      await harness.services.accounts.pendingInvitation(rotatedHash, 'over-limit@example.test'),
    ).toBeNull()
  })
  it('denies anonymous link management and cross-account mutation attempts', async () => {
    const { harness, owner } = await fixture()
    const anonymous = new TestClient(harness.app, harness.env)
    expect(await responseStatus(anonymous.post('/api/me/referral-link', {}))).toBe(401)
    expect(await responseStatus(anonymous.post('/api/me/referral-link/rotate', {}))).toBe(401)
    expect(
      await responseStatus(anonymous.request('/api/me/referral-link', { method: 'DELETE' })),
    ).toBe(401)
    const wrongUser = await owner.request('/api/me/referral-link/rotate', {
      method: 'POST',
      headers: { 'x-lumafoil-account-id': 'someone-else' },
    })
    expect(wrongUser.status).toBe(403)
  })
})
