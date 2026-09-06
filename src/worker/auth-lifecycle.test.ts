import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { findLink, TestClient } from './test-support/client'
import { createTestHarness, type TestHarness } from './test-support/test-app'
import { HTTP_STATUS } from '../shared/constants'

const owner = {
  name: 'Olivia Owner',
  email: 'olivia@example.test',
  password: 'correct horse battery',
}
const invitee = {
  name: 'Eddie Editor',
  email: 'eddie@example.test',
  password: 'editors long password',
}

const createdOrganizationSchema = z.object({ id: z.string() })
const invitationSchema = z.object({ id: z.string() })
const memberSchema = z.object({ member: z.object({ id: z.string() }) })

let harness: TestHarness
let ownerClient: TestClient
let organizationId: string

beforeEach(async () => {
  harness = createTestHarness()
  ownerClient = new TestClient(harness.app, harness.env)
  await ownerClient.signUpAndVerify(harness.mailbox, owner)
  const created = await ownerClient.post('/api/auth/organization/create', {
    name: 'Acme Studio',
    slug: 'acme-studio',
  })
  organizationId = createdOrganizationSchema.parse(await created.json()).id
})

async function actions() {
  const records = await harness.audit.listForOrganization(organizationId)
  return records.map((record) => record.action)
}

describe('organization lifecycle audit trail', () => {
  it('records updates and deletion', async () => {
    const update = await ownerClient.post('/api/auth/organization/update', {
      organizationId,
      data: { name: 'Acme Studio Renamed' },
    })
    expect(update.status).toBe(HTTP_STATUS.ok)
    expect(await actions()).toContain('organization.updated')

    const remove = await ownerClient.post('/api/auth/organization/delete', { organizationId })
    expect(remove.status).toBe(HTTP_STATUS.ok)
    expect(await actions()).toContain('organization.deleted')
  })

  it('records cancelled invitations and removed members', async () => {
    const invite = await ownerClient.post('/api/auth/organization/invite-member', {
      email: invitee.email,
      role: 'editor',
      organizationId,
    })
    const invitationId = invitationSchema.parse(await invite.json()).id
    const cancel = await ownerClient.post('/api/auth/organization/cancel-invitation', {
      invitationId,
    })
    expect(cancel.status).toBe(HTTP_STATUS.ok)
    expect(await actions()).toContain('invitation.cancelled')

    const reinvite = await ownerClient.post('/api/auth/organization/invite-member', {
      email: invitee.email,
      role: 'editor',
      organizationId,
    })
    const acceptPath = findLink(harness.mailbox, invitee.email, '/accept-invitation/')
    expect(reinvite.status).toBe(HTTP_STATUS.ok)
    const editorClient = new TestClient(harness.app, harness.env)
    await editorClient.signUpAndVerify(harness.mailbox, invitee)
    const accept = await editorClient.post('/api/auth/organization/accept-invitation', {
      invitationId: acceptPath.split('/').at(-1),
    })
    const { member } = memberSchema.parse(await accept.json())

    const removal = await ownerClient.post('/api/auth/organization/remove-member', {
      memberIdOrEmail: member.id,
      organizationId,
    })
    expect(removal.status).toBe(HTTP_STATUS.ok)
    expect(await actions()).toContain('member.removed')
  })
})

describe('password reset', () => {
  it('emails a reset link and accepts a new password once', async () => {
    const request = await ownerClient.post('/api/auth/request-password-reset', {
      email: owner.email,
      redirectTo: '/reset-password',
    })
    expect(request.status).toBe(HTTP_STATUS.ok)
    const resetPath = findLink(harness.mailbox, owner.email, '/api/auth/reset-password/')
    const redirect = await ownerClient.get(resetPath)
    expect(redirect.status).toBe(HTTP_STATUS.found)
    const location = new URL(redirect.headers.get('location') ?? '', 'http://localhost:5173')
    expect(location.pathname).toBe('/reset-password')
    const token = location.searchParams.get('token')
    expect(token).not.toBeNull()

    const newPassword = 'a brand new passphrase'
    const reset = await ownerClient.post('/api/auth/reset-password', { newPassword, token })
    expect(reset.status).toBe(HTTP_STATUS.ok)

    const fresh = new TestClient(harness.app, harness.env)
    const oldPassword = await fresh.post('/api/auth/sign-in/email', {
      email: owner.email,
      password: owner.password,
    })
    expect(oldPassword.status).toBe(HTTP_STATUS.unauthorized)
    const signIn = await fresh.post('/api/auth/sign-in/email', {
      email: owner.email,
      password: newPassword,
    })
    expect(signIn.status).toBe(HTTP_STATUS.ok)

    const reuse = await fresh.post('/api/auth/reset-password', {
      newPassword: 'yet another one',
      token,
    })
    expect(reuse.status).toBeGreaterThanOrEqual(HTTP_STATUS.badRequest)
  })
})
