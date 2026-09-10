import { describe, expect, it } from 'vitest'

import { invitationTokenHash } from './invitation-admission'
import { INVITATION_HEADER } from '../../shared/invitation'
import { seedInviter } from '../test-support/inviter'
import { responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const PERSON = {
  name: 'Invited Person',
  email: 'invited@example.test',
  password: 'a long fixture password',
}
const TOKEN = 'private-site-invitation-token'
const OFFSET_MS = 60_000

async function fixture({
  accepted = false,
  revoked = false,
  expired = false,
  email = PERSON.email,
} = {}) {
  const harness = createTestHarness({ invitationOnly: true })
  const context = await harness.services.auth.$context
  await seedInviter(harness, 'inviter')
  await harness.services.accounts.createInvitation({
    id: 'invitation-record',
    tokenHash: await invitationTokenHash(TOKEN),
    inviterId: 'inviter',
    email,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + (expired ? -OFFSET_MS : OFFSET_MS)),
    acceptedAt: accepted ? new Date() : null,
    acceptedUserId: null,
    revokedAt: revoked ? new Date() : null,
  })
  const signup = (token?: string, submittedEmail = PERSON.email, endpoint = '/sign-up/email') =>
    harness.services.auth.handler(
      new Request(`http://localhost:5273/api/auth${endpoint}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5273',
          ...(token !== undefined && { [INVITATION_HEADER]: token }),
        },
        body: JSON.stringify({ ...PERSON, email: submittedEmail, callbackURL: '/app' }),
      }),
    )
  return { harness, context, signup }
}

describe('private invitation-only admission', () => {
  it.each(['banned', 'deleted', 'unverified'] as const)(
    'refuses a targeted invitation from a now-%s inviter without exposing its status',
    async (state) => {
      const { harness, context, signup } = await fixture()
      if (state === 'deleted')
        await context.adapter.delete({ model: 'user', where: [{ field: 'id', value: 'inviter' }] })
      else
        await context.adapter.update({
          model: 'user',
          where: [{ field: 'id', value: 'inviter' }],
          update:
            state === 'banned'
              ? { banned: true, banReason: 'PRIVATE_BAN_CANARY' }
              : { emailVerified: false },
        })
      const response = await signup(TOKEN)
      expect(response.status).toBe(403)
      const body = await response.text()
      expect(body).toContain('INVITATION_REQUIRED')
      expect(body).not.toContain('PRIVATE_BAN_CANARY')
      expect(body).not.toContain(state)
      expect(harness.mailbox.messages()).toEqual([])
    },
  )
  it('admits only the invited email, consumes the token and grants no inviter membership', async () => {
    const { harness, context, signup } = await fixture()
    const uppercaseEmail = PERSON.email.toUpperCase()
    expect(await responseStatus(signup(TOKEN, uppercaseEmail))).toBe(200)
    expect(harness.mailbox.messages()).toHaveLength(1)
    expect(harness.mailbox.messages()[0]?.text).toContain(encodeURIComponent('/app'))
    expect(await context.adapter.count({ model: 'user' })).toBe(2)
    expect(await context.adapter.count({ model: 'member' })).toBe(0)
    expect(await responseStatus(signup(TOKEN))).toBe(403)
    expect(await context.adapter.count({ model: 'user' })).toBe(2)
    const stats = await harness.services.accounts.statistics()
    expect(stats.acceptedInvitations).toBe(1)
  })
  it.each([undefined, 'unknown-invitation', 'bad/id'])(
    'rejects absent or invalid invitation %s',
    async (token) => {
      const { harness, context, signup } = await fixture()
      const result = await signup(token)
      expect(result.status).toBe(403)
      expect(await result.json()).toMatchObject({ code: 'INVITATION_REQUIRED' })
      expect(harness.mailbox.messages()).toEqual([])
      expect(await context.adapter.count({ model: 'user' })).toBe(1)
    },
  )
  it.each([
    { accepted: true },
    { revoked: true },
    { expired: true },
    { email: 'another@example.test' },
  ])('rejects unusable invitation %j', async (options) => {
    const { harness, signup } = await fixture(options)
    expect(await responseStatus(signup(TOKEN))).toBe(403)
    expect(harness.mailbox.messages()).toEqual([])
  })
  it('rejects organization membership invitations as site admission', async () => {
    const { context, signup } = await fixture()
    const invite = await context.adapter.create<{ id: string }>({
      model: 'invitation',
      data: {
        organizationId: 'shared',
        inviterId: 'owner',
        email: PERSON.email,
        role: 'editor',
        status: 'pending',
        expiresAt: new Date(Date.now() + OFFSET_MS),
        createdAt: new Date(),
      },
    })
    expect(await responseStatus(signup(invite.id))).toBe(403)
  })
  it('rejects malformed email and trailing-slash bypass', async () => {
    const { harness, signup } = await fixture()
    expect(await responseStatus(signup(TOKEN, 'invalid-email'))).not.toBe(200)
    expect(await responseStatus(signup(undefined, PERSON.email, '/sign-up/email/'))).not.toBe(200)
    expect(harness.mailbox.messages()).toEqual([])
  })
})
