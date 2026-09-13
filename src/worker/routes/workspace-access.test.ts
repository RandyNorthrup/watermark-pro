import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import { privateWorkspaceSchema } from '../../shared/api-accounts'
import { INVITATION_HEADER } from '../../shared/invitation'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import {
  WORKSPACE_ACCESS_POLICY,
  workspaceAccessSchema,
  workspaceLinkCreatedSchema,
} from '../../shared/workspace-access'
import { findLink, joinAsMember, signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Access Owner',
  email: 'access-owner@example.test',
  password: 'a long access owner password',
}
const OTHER = {
  name: 'Access Reader',
  email: 'access-reader@example.test',
  password: 'a long access reader password',
}
const NEW = {
  name: 'New Invited User',
  email: 'new-access@example.test',
  password: 'a long new invited password',
}
const sessionSchema = z.object({ user: z.object({ id: z.string() }) })
const permissionResultSchema = z.object({ success: z.boolean() })
async function fixture() {
  const harness = createTestHarness()
  const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
    name: 'Shared Fixture',
    slug: 'access-shared-fixture',
  })
  const personal = privateWorkspaceSchema.parse(
    await responseJson(owner.post('/api/me/workspace', {})),
  ).organizationId
  const other = new TestClient(harness.app, harness.env)
  await other.signUpAndVerify(harness.mailbox, OTHER)
  const otherPersonal = privateWorkspaceSchema.parse(
    await responseJson(other.post('/api/me/workspace', {})),
  ).organizationId
  const path = `/api/orgs/${personal}/access`
  return { harness, owner, other, organizationId, personal, otherPersonal, path }
}
describe('explicit workspace access with real authenticated accounts', () => {
  it('silently grants View, changes to Edit, revokes access, and never shares another workspace', async () => {
    const { harness, owner, other, path, personal, organizationId, otherPersonal } = await fixture()
    const before = harness.mailbox.messages().length
    const ownerPermissions = permissionResultSchema.parse(
      await responseJson(
        owner.post('/api/auth/organization/has-permission', {
          organizationId: personal,
          permissions: { member: ['create', 'update', 'delete'], invitation: ['create', 'cancel'] },
        }),
      ),
    )
    expect(ownerPermissions.success).toBe(true)
    expect(await responseStatus(other.get(`/api/orgs/${personal}/watermarks`))).toBe(403)
    expect(
      await responseStatus(
        owner.post(`${path}/members`, { email: OTHER.email, role: 'viewer', notify: false }),
      ),
    ).toBe(204)
    expect(harness.mailbox.messages()).toHaveLength(before)
    const access = workspaceAccessSchema.parse(await responseJson(owner.get(path)))
    const target = access.members.find((entry) => entry.email === OTHER.email)
    expect(target?.role).toBe('viewer')
    expect(await responseStatus(other.get(`/api/orgs/${personal}/watermarks`))).toBe(200)
    expect(
      await responseStatus(
        other.post(`/api/orgs/${personal}/watermarks`, { name: 'Denied', spec: DEFAULT_TEXT_SPEC }),
      ),
    ).toBe(403)
    const observed1 = await responseStatus(
      owner.request(`${path}/members/${target?.id ?? 'missing-fixture'}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'editor' }),
      }),
    )
    expect(observed1).toBe(204)
    expect(
      await responseStatus(
        other.post(`/api/orgs/${personal}/watermarks`, {
          name: 'Shared Draft',
          spec: DEFAULT_TEXT_SPEC,
        }),
      ),
    ).toBe(201)
    expect(await responseStatus(other.get(`/api/orgs/${organizationId}/watermarks`))).toBe(403)
    expect(await responseStatus(owner.get(`/api/orgs/${otherPersonal}/watermarks`))).toBe(403)
    expect(
      await responseStatus(
        owner.request(`${path}/members/${target?.id ?? 'missing-fixture'}`, { method: 'DELETE' }),
      ),
    ).toBe(204)
    expect(await responseStatus(other.get(`/api/orgs/${personal}/watermarks`))).toBe(403)
    expect(await responseStatus(other.get(`/api/orgs/${otherPersonal}/watermarks`))).toBe(200)
  })
  it.each(['admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'denies access changes by %s, including direct legacy auth calls',
    async (role) => {
      const { harness, owner, organizationId } = await fixture()
      const actor =
        role === 'anonymous' || role === 'non-member'
          ? new TestClient(harness.app, harness.env)
          : await joinAsMember(harness, owner, organizationId, NEW, role)
      if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, NEW)
      const path = `/api/orgs/${organizationId}/access`
      const denied = role === 'anonymous' ? 401 : 403
      if (['admin', 'editor', 'viewer'].includes(role)) {
        for (const permissions of [
          { member: ['create', 'update', 'delete'] },
          { invitation: ['create', 'cancel'] },
        ]) {
          const result = permissionResultSchema.parse(
            await responseJson(
              actor.post('/api/auth/organization/has-permission', { organizationId, permissions }),
            ),
          )
          expect(result.success).toBe(false)
        }
      }
      expect(
        await responseStatus(
          actor.post(`${path}/members`, { email: OTHER.email, role: 'editor', notify: false }),
        ),
      ).toBe(denied)
      expect(await responseStatus(actor.post(`${path}/links`, { role: 'viewer', days: 7 }))).toBe(
        denied,
      )
      expect(
        await responseStatus(actor.request(`${path}/members/foreign`, { method: 'DELETE' })),
      ).toBe(denied)
      const observed2 = await responseStatus(
        actor.request(`${path}/members/foreign`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role: 'editor' }),
        }),
      )
      expect(observed2).toBe(denied)
      expect(
        await responseStatus(actor.request(`${path}/links/foreign`, { method: 'DELETE' })),
      ).toBe(denied)
      const legacy = await actor.post('/api/auth/organization/invite-member', {
        organizationId,
        email: 'legacy@example.test',
        role: 'editor',
      })
      expect(legacy.status).toBe(denied)
    },
  )
  it('protects owners, validates grants, rejects unknown silent adds, and binds stale tabs to their account', async () => {
    const { owner, other, path, harness } = await fixture()
    const access = workspaceAccessSchema.parse(await responseJson(owner.get(path)))
    const own = access.members.find((entry) => entry.role === 'owner')
    expect(
      await responseStatus(
        owner.request(`${path}/members/${own?.id ?? 'missing-fixture'}`, { method: 'DELETE' }),
      ),
    ).toBe(403)
    const observed3 = await responseStatus(
      owner.request(`${path}/members/${own?.id ?? 'missing-fixture'}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'viewer' }),
      }),
    )
    expect(observed3).toBe(403)
    for (const role of ['owner', 'admin', 'invalid'])
      expect(
        await responseStatus(
          owner.post(`${path}/members`, { email: OTHER.email, role, notify: false }),
        ),
      ).toBe(400)
    expect(await responseStatus(owner.post(`${path}/links`, { role: 'viewer', days: 0 }))).toBe(400)
    expect(
      await responseStatus(
        owner.post(`${path}/members`, {
          email: 'missing@example.test',
          role: 'viewer',
          notify: false,
        }),
      ),
    ).toBe(409)
    const otherId = sessionSchema.parse(await responseJson(other.get('/api/auth/get-session'))).user
      .id
    const observed4 = await responseStatus(
      owner.request(`${path}/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [ACCOUNT_ID_HEADER]: otherId },
        body: JSON.stringify({ role: 'viewer', days: 7 }),
      }),
    )
    expect(observed4).toBe(403)
    const ctx = await harness.services.auth.$context
    await ctx.adapter.update({
      model: 'member',
      where: [{ field: 'id', value: own?.id ?? '' }],
      update: { role: 'viewer' },
    })
    vi.spyOn(harness.services.workspaceAccess, 'isOwner').mockResolvedValueOnce(true)
    expect(
      await responseStatus(
        owner.post(`${path}/members`, { email: OTHER.email, role: 'editor', notify: false }),
      ),
    ).toBe(409)
    const observed5 = workspaceAccessSchema.parse(await responseJson(owner.get(path))).members
    expect(observed5).toHaveLength(1)
  })
  it('requires explicit acceptance, preserves existing permissions, and revokes reusable links', async () => {
    const { owner, other, path, personal, harness } = await fixture()
    const created = workspaceLinkCreatedSchema.parse(
      await responseJson(owner.post(`${path}/links`, { role: 'editor', days: 1 })),
    )
    const token = new URL(created.url).pathname.split('/').at(-1) ?? ''
    const previewPath = `/api/me/workspace-invitations/${token}`
    expect(await responseStatus(other.get(`/api/orgs/${personal}/watermarks`))).toBe(403)
    expect(await responseStatus(new TestClient(harness.app, harness.env).get(previewPath))).toBe(
      401,
    )
    expect(await responseStatus(other.get(previewPath))).toBe(200)
    expect(await responseStatus(other.post(`${previewPath}/accept`, {}))).toBe(200)
    expect(await responseStatus(other.post(`${previewPath}/accept`, {}))).toBe(200)
    const access = workspaceAccessSchema.parse(await responseJson(owner.get(path)))
    expect(access.members.filter((entry) => entry.email === OTHER.email)).toHaveLength(1)
    const memberId = access.members.find((entry) => entry.email === OTHER.email)?.id ?? ''
    await owner.request(`${path}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'viewer' }),
    })
    await other.post(`${previewPath}/accept`, {})
    const observed6 = workspaceAccessSchema
      .parse(await responseJson(owner.get(path)))
      .members.find((entry) => entry.id === memberId)?.role
    expect(observed6).toBe('viewer')
    const observed7 = workspaceAccessSchema.parse(await responseJson(other.get(path))).links
    expect(observed7).toEqual([])
    expect(JSON.stringify(access)).not.toContain(token)
    expect(
      await responseStatus(owner.request(`${path}/links/${created.link.id}`, { method: 'DELETE' })),
    ).toBe(204)
    expect(await responseStatus(other.post(`${previewPath}/accept`, {}))).toBe(404)
    expect(await responseStatus(other.get(`/api/orgs/${personal}/watermarks`))).toBe(200)
  })
  it('sends a separate account invitation and email-bound workspace grant; wrong email cannot accept', async () => {
    const { owner, other, path, harness, personal } = await fixture()
    expect(
      await responseStatus(
        owner.post(`${path}/members`, { email: NEW.email, role: 'viewer', notify: true }),
      ),
    ).toBe(204)
    const invitationUrl = findLink(harness.mailbox, NEW.email, '/workspace-invitation/')
    const token = invitationUrl.split('/').at(-1) ?? ''
    expect(
      await responseStatus(other.post(`/api/me/workspace-invitations/${token}/accept`, {})),
    ).toBe(404)
    const signupUrl = findLink(harness.mailbox, NEW.email, '/signup?')
    const admission =
      new URL(signupUrl, 'http://localhost:5273').searchParams.get('invitation') ?? ''
    expect(admission).not.toBe(token)
    const invited = new TestClient(harness.app, harness.env)
    const observed8 = await responseStatus(
      invited.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [INVITATION_HEADER]: admission },
        body: JSON.stringify(NEW),
      }),
    )
    expect(observed8).toBe(200)
    await invited.get(findLink(harness.mailbox, NEW.email, '/api/auth/verify-email'))
    expect(await responseStatus(invited.get(`/api/orgs/${personal}/watermarks`))).toBe(403)
    expect(
      await responseStatus(invited.post(`/api/me/workspace-invitations/${token}/accept`, {})),
    ).toBe(200)
    expect(await responseStatus(invited.get(`/api/orgs/${personal}/watermarks`))).toBe(200)
  })
  it('revokes both pending grants on mail failure and rejects expired or invalid links', async () => {
    const { owner, other, path, harness } = await fixture()
    vi.spyOn(harness.services.email, 'send').mockRejectedValueOnce(
      new Error('mail unavailable fixture'),
    )
    expect(
      await responseStatus(
        owner.post(`${path}/members`, { email: NEW.email, role: 'viewer', notify: true }),
      ),
    ).toBe(500)
    const access = workspaceAccessSchema.parse(await responseJson(owner.get(path)))
    expect(access.links[0]?.status).toBe('revoked')
    const ownerId = sessionSchema.parse(await responseJson(owner.get('/api/auth/get-session'))).user
      .id
    const invitations = await harness.services.accounts.listInvitations(ownerId)
    expect(invitations[0]?.revokedAt).toBeInstanceOf(Date)
    const created = workspaceLinkCreatedSchema.parse(
      await responseJson(owner.post(`${path}/links`, { role: 'viewer', days: 1 })),
    )
    const token = new URL(created.url).pathname.split('/').at(-1) ?? ''
    const realNow = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 2 * 86_400_000)
    expect(
      await responseStatus(other.post(`/api/me/workspace-invitations/${token}/accept`, {})),
    ).toBe(404)
    vi.restoreAllMocks()
    expect(await responseStatus(other.get('/api/me/workspace-invitations/invalid'))).toBe(404)
  })

  it('charges existing-recipient email attempts across workspaces even after failure, revocation, and workspace deletion', async () => {
    const { owner, other, path: personalPath, harness, organizationId } = await fixture()
    const path = `/api/orgs/${organizationId}/access`
    const ownerId = sessionSchema.parse(await responseJson(owner.get('/api/auth/get-session'))).user
      .id
    const input = { email: OTHER.email, role: 'viewer', notify: true }
    vi.spyOn(harness.services.email, 'send').mockRejectedValueOnce(
      new Error('fixture mail failure'),
    )
    expect(await responseStatus(owner.post(`${path}/members`, input))).toBe(500)
    for (let attempt = 1; attempt < WORKSPACE_ACCESS_POLICY.sendsPerWindow; attempt += 1) {
      expect(await responseStatus(owner.post(`${path}/members`, input))).toBe(204)
      const access = workspaceAccessSchema.parse(await responseJson(owner.get(path)))
      const invitation = access.links.find((link) => link.status === 'pending')
      expect(invitation).toBeDefined()
      expect(
        await responseStatus(
          owner.request(`${path}/links/${invitation?.id ?? ''}`, { method: 'DELETE' }),
        ),
      ).toBe(204)
    }
    const charges = harness.audit.records.filter(
      (record) =>
        record.actorUserId === ownerId &&
        record.action === WORKSPACE_ACCESS_POLICY.invitationAuditAction,
    )
    expect(charges).toHaveLength(WORKSPACE_ACCESS_POLICY.sendsPerWindow)
    const legacy = await owner.post('/api/auth/organization/invite-member', {
      organizationId,
      email: OTHER.email,
      role: 'viewer',
      resend: true,
    })
    expect(legacy.status).toBe(429)
    expect(legacy.headers.get('retry-after')).toBe(
      String(WORKSPACE_ACCESS_POLICY.sendWindowSeconds),
    )
    const context = await harness.services.auth.$context
    await context.adapter.delete({
      model: 'organization',
      where: [{ field: 'id', value: organizationId }],
    })
    const exhausted = await owner.post(`${personalPath}/members`, input)
    expect(exhausted.status).toBe(429)
    expect(exhausted.headers.get('retry-after')).toBe(
      String(WORKSPACE_ACCESS_POLICY.sendWindowSeconds),
    )
    expect(
      harness.audit.records.filter(
        (record) => record.action === WORKSPACE_ACCESS_POLICY.invitationAuditAction,
      ),
    ).toHaveLength(WORKSPACE_ACCESS_POLICY.sendsPerWindow)
    const otherOrganization = await other.createOrganization('Other Sender', 'other-sender-budget')
    expect(
      await responseStatus(
        other.post(`/api/orgs/${otherOrganization}/access/members`, {
          email: OWNER.email,
          role: 'viewer',
          notify: true,
        }),
      ),
    ).toBe(204)
    expect(
      await responseStatus(owner.post(`${personalPath}/links`, { role: 'viewer', days: 1 })),
    ).toBe(201)
    expect(
      await responseStatus(owner.post(`${personalPath}/members`, { ...input, notify: false })),
    ).toBe(204)
    for (const charge of charges)
      charge.createdAt = new Date(Date.now() - WORKSPACE_ACCESS_POLICY.sendWindowMs - 1)
    expect(await responseStatus(owner.post(`${personalPath}/members`, input))).toBe(204)
  })
})
