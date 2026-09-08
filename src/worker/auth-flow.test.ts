import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { findLink, TestClient } from './test-support/client'
import { createTestHarness, type TestHarness } from './test-support/test-app'
import { apiErrorSchema, auditListResponseSchema } from '../shared/api'
import { API_ERROR_CODE, HTTP_STATUS } from '../shared/constants'

const owner = {
  name: 'Olivia Owner',
  email: 'olivia@example.test',
  password: 'correct horse battery',
}
const invitee = { name: 'Vic Viewer', email: 'vic@example.test', password: 'another strong pass!' }
const stranger = {
  name: 'Sam Stranger',
  email: 'sam@example.test',
  password: 'strangers password 1',
}

const acceptedInvitationSchema = z.object({
  member: z.object({ id: z.string(), role: z.string() }),
})
const sessionSchema = z.object({
  user: z.object({ email: z.string(), emailVerified: z.boolean() }),
})
const activeRoleSchema = z.object({ role: z.string() })
const mailboxMessageSchema = z.object({ to: z.string() })
const mailboxSchema = z.object({ messages: z.array(mailboxMessageSchema) })

let harness: TestHarness
let ownerClient: TestClient

async function createOrganization(client: TestClient, name: string, slug: string) {
  return await client.createOrganization(name, slug)
}

async function inviteAndAccept(
  organizationId: string,
  role: string,
  person: typeof invitee,
): Promise<{ client: TestClient; memberId: string }> {
  const invite = await ownerClient.post('/api/auth/organization/invite-member', {
    email: person.email,
    role,
    organizationId,
  })
  expect(invite.status).toBe(HTTP_STATUS.ok)
  const acceptPath = findLink(harness.mailbox, person.email, '/accept-invitation/')
  const invitationId = acceptPath.split('/').at(-1)

  const client = new TestClient(harness.app, harness.env)
  await client.signUpAndVerify(harness.mailbox, person)
  const accept = await client.post('/api/auth/organization/accept-invitation', { invitationId })
  expect(accept.status).toBe(HTTP_STATUS.ok)
  const { member } = acceptedInvitationSchema.parse(await accept.json())
  expect(member.role).toBe(role)
  return { client, memberId: member.id }
}

async function auditActions(client: TestClient, organizationId: string) {
  const response = await client.get(`/api/orgs/${organizationId}/audit`)
  return {
    status: response.status,
    actions:
      response.status === HTTP_STATUS.ok
        ? auditListResponseSchema.parse(await response.json()).entries.map((entry) => entry.action)
        : [],
  }
}

beforeEach(async () => {
  harness = createTestHarness()
  ownerClient = new TestClient(harness.app, harness.env)
  await ownerClient.signUpAndVerify(harness.mailbox, owner)
})

describe('sign-up and email verification', () => {
  it('refuses sign-in until the email address is verified', async () => {
    const client = new TestClient(harness.app, harness.env)
    const signUp = await client.post('/api/auth/sign-up/email', stranger)
    expect(signUp.status).toBe(HTTP_STATUS.ok)

    const signIn = await client.post('/api/auth/sign-in/email', {
      email: stranger.email,
      password: stranger.password,
    })
    expect(signIn.status).toBe(HTTP_STATUS.forbidden)

    const session = await client.get('/api/auth/get-session')
    expect(await session.json()).toBeNull()
  })

  it('signs the user in after the verification link and records the sign-up in the audit trail', async () => {
    const session = await ownerClient.get('/api/auth/get-session')
    const { user } = sessionSchema.parse(await session.json())
    expect(user.email).toBe(owner.email)
    expect(user.emailVerified).toBe(true)
    expect(harness.audit.records).toContainEqual(
      expect.objectContaining({ action: 'user.signed_up', actorName: owner.name }),
    )
  })

  it('enforces the password policy', async () => {
    const client = new TestClient(harness.app, harness.env)
    const response = await client.post('/api/auth/sign-up/email', {
      ...stranger,
      password: 'short',
    })
    expect(response.status).toBe(HTTP_STATUS.badRequest)
  })

  it('sets HttpOnly, SameSite=Lax session cookies', async () => {
    const client = new TestClient(harness.app, harness.env)
    await client.post('/api/auth/sign-up/email', stranger)
    const link = findLink(harness.mailbox, stranger.email, '/api/auth/verify-email')
    const response = await client.get(link)

    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('better-auth.session_token='))
    expect(sessionCookie).toMatch(/HttpOnly/i)
    expect(sessionCookie).toMatch(/SameSite=Lax/i)
    expect(sessionCookie).toMatch(/Path=\//)
  })

  it('clears the offline caches and local storage on sign-out', async () => {
    // ownerClient is signed in (beforeEach). Signing out must instruct the
    // browser to drop cached shell assets and persisted data (M19, shared
    // devices); Better Auth clears the cookie on its own.
    const response = await ownerClient.post('/api/auth/sign-out', {})
    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(response.headers.get('clear-site-data')).toBe('"cache", "storage"')
  })
})

describe('cross-site request protection', () => {
  it('rejects a JSON sign-in posted from a foreign origin', async () => {
    const client = new TestClient(harness.app, harness.env)
    client.useOrigin('https://evil.example')
    const response = await client.post('/api/auth/sign-in/email', {
      email: owner.email,
      password: owner.password,
    })
    expect(response.status).toBe(HTTP_STATUS.forbidden)
  })

  it('rejects a post that carries no Origin header at all', async () => {
    const response = await harness.app.request(
      'http://localhost:5273/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: owner.email, password: owner.password }),
      },
      harness.env,
    )
    expect(response.status).toBe(HTTP_STATUS.forbidden)
  })

  it('rejects a form-encoded post from a foreign origin before reaching any handler', async () => {
    const client = new TestClient(harness.app, harness.env)
    client.useOrigin('https://evil.example')
    const response = await client.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a%40b.c&password=x',
    })
    expect(response.status).toBe(HTTP_STATUS.forbidden)
  })
})

describe('organizations and RBAC', () => {
  it('makes the creator an owner and writes an audit entry', async () => {
    const organizationId = await createOrganization(ownerClient, 'Acme Studio', 'acme-studio')

    const active = await ownerClient.get('/api/auth/organization/get-active-member-role')
    expect(activeRoleSchema.parse(await active.json()).role).toBe('owner')
    expect(await harness.audit.listForOrganization(organizationId)).toContainEqual(
      expect.objectContaining({ action: 'organization.created', actorName: owner.name }),
    )
  })

  it('lets owners read the audit trail and denies everyone else', async () => {
    const organizationId = await createOrganization(ownerClient, 'Acme Studio', 'acme-studio')

    const asOwner = await auditActions(ownerClient, organizationId)
    expect(asOwner.status).toBe(HTTP_STATUS.ok)
    expect(asOwner.actions).toContain('organization.created')

    const anonymous = new TestClient(harness.app, harness.env)
    const asAnonymous = await anonymous.get(`/api/orgs/${organizationId}/audit`)
    expect(asAnonymous.status).toBe(HTTP_STATUS.unauthorized)
    expect(apiErrorSchema.parse(await asAnonymous.json()).error).toBe(
      API_ERROR_CODE.unauthenticated,
    )

    const strangerClient = new TestClient(harness.app, harness.env)
    await strangerClient.signUpAndVerify(harness.mailbox, stranger)
    const asStranger = await strangerClient.get(`/api/orgs/${organizationId}/audit`)
    expect(asStranger.status).toBe(HTTP_STATUS.forbidden)
    expect(apiErrorSchema.parse(await asStranger.json()).error).toBe(API_ERROR_CODE.forbidden)
  })

  it('applies invitation roles and role changes to permissions', async () => {
    const organizationId = await createOrganization(ownerClient, 'Acme Studio', 'acme-studio')
    const { client: memberClient, memberId } = await inviteAndAccept(
      organizationId,
      'viewer',
      invitee,
    )

    const asViewer = await auditActions(memberClient, organizationId)
    expect(asViewer.status).toBe(HTTP_STATUS.forbidden)

    const promoteToEditor = await ownerClient.post('/api/auth/organization/update-member-role', {
      memberId,
      role: 'editor',
      organizationId,
    })
    expect(promoteToEditor.status).toBe(HTTP_STATUS.ok)
    const asEditor = await auditActions(memberClient, organizationId)
    expect(asEditor.status).toBe(HTTP_STATUS.forbidden)

    const promoteToAdmin = await ownerClient.post('/api/auth/organization/update-member-role', {
      memberId,
      role: 'admin',
      organizationId,
    })
    expect(promoteToAdmin.status).toBe(HTTP_STATUS.ok)
    const asAdmin = await auditActions(memberClient, organizationId)
    expect(asAdmin.status).toBe(HTTP_STATUS.ok)
    expect(asAdmin.actions).toEqual(
      expect.arrayContaining([
        'invitation.created',
        'invitation.accepted',
        'member.role_updated',
        'organization.created',
      ]),
    )
  })

  it('stops a viewer from inviting members', async () => {
    const organizationId = await createOrganization(ownerClient, 'Acme Studio', 'acme-studio')
    const { client: viewerClient } = await inviteAndAccept(organizationId, 'viewer', invitee)

    const response = await viewerClient.post('/api/auth/organization/invite-member', {
      email: stranger.email,
      role: 'viewer',
      organizationId,
    })
    expect(response.status).toBe(HTTP_STATUS.forbidden)
  })

  it('answers 404 for an audit request without an organization id', async () => {
    const response = await ownerClient.get('/api/orgs//audit')
    expect(response.status).toBe(HTTP_STATUS.notFound)
  })
})

describe('development mailbox', () => {
  it('exposes captured messages with the console provider', async () => {
    const response = await ownerClient.get('/api/dev/mailbox')
    expect(response.status).toBe(HTTP_STATUS.ok)
    const { messages } = mailboxSchema.parse(await response.json())
    expect(messages.map((message) => message.to)).toContain(owner.email)
  })
})
