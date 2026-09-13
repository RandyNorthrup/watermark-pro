import { env } from 'cloudflare:workers'

import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  WORKSPACE_ACCESS_POLICY,
  workspaceAccessSchema,
  workspaceLinkCreatedSchema,
} from '../../shared/workspace-access'
import { auditLog, member, organization, user, workspaceAccessLink } from '../db/schema'
import { createApp } from '../index'
import { getServices } from '../services'
import { TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'

const app = createApp()
const OWNER = {
  name: 'D1 Access Owner',
  email: 'd1-access-owner@example.test',
  password: 'a strong owner fixture password',
}
const OTHER = {
  name: 'D1 Access Other',
  email: 'd1-access-other@example.test',
  password: 'a strong other fixture password',
}
const userSchema = z.object({ user: z.object({ id: z.string() }) })
describe('workspace access persists and authorizes atomically in D1', () => {
  let owner: TestClient
  let other: TestClient
  let ownerId: string
  let otherId: string
  beforeAll(async () => {
    const mailbox = getServices(env).devMailbox
    if (mailbox === undefined) throw new Error('D1 fixture requires console mailbox')
    owner = new TestClient(app, env)
    other = new TestClient(app, env)
    await owner.signUpAndVerify(mailbox, OWNER)
    await other.signUpAndVerify(mailbox, OTHER)
    ownerId = userSchema.parse(await responseJson(owner.get('/api/auth/get-session'))).user.id
    otherId = userSchema.parse(await responseJson(other.get('/api/auth/get-session'))).user.id
  })
  async function workspace() {
    const id = await owner.createOrganization('Access Proof', `access-${crypto.randomUUID()}`)
    return { id, path: `/api/orgs/${id}/access` }
  }
  it('adds, updates, and removes the exact member with audit records; owner is immutable', async () => {
    const { db, workspaceAccess } = getServices(env)
    const { id, path } = await workspace()
    expect(
      await responseStatus(
        owner.post(`${path}/members`, { email: OTHER.email, role: 'viewer', notify: false }),
      ),
    ).toBe(204)
    let access = workspaceAccessSchema.parse(await responseJson(owner.get(path)))
    const target = access.members.find((entry) => entry.userId === otherId)
    const ownerMembership = access.members.find((entry) => entry.userId === ownerId)
    expect(target?.role).toBe('viewer')
    const observed1 = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, id), eq(auditLog.action, 'workspace_access.added')))
    expect(observed1).toHaveLength(1)
    expect(await workspaceAccess.change(id, ownerId, target?.id ?? '', 'editor')).toBe(true)
    expect(await workspaceAccess.change(id, otherId, ownerMembership?.id ?? '', 'viewer')).toBe(
      false,
    )
    expect(await workspaceAccess.remove(id, ownerId, ownerMembership?.id ?? '')).toBe(false)
    expect(await workspaceAccess.add(id, ownerId, OTHER.email, 'viewer')).toBe(false)
    access = workspaceAccessSchema.parse(await responseJson(owner.get(path)))
    expect(access.members.find((entry) => entry.userId === otherId)?.role).toBe('editor')
    expect(await workspaceAccess.remove(id, ownerId, target?.id ?? '')).toBe(true)
    expect(await responseStatus(other.get(path))).toBe(403)
    const actions = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(eq(auditLog.organizationId, id), sql`${auditLog.action} LIKE 'workspace_access.%'`),
      )
    expect(
      actions.map((entry) => entry.action).toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(['workspace_access.added', 'workspace_access.changed', 'workspace_access.removed'])
  })
  it('rejects unverified and banned recipients even with a verified owner in the user table', async () => {
    const { db, workspaceAccess } = getServices(env)
    const { id } = await workspace()
    for (const fixture of [
      {
        id: 'unverified-access',
        email: 'unverified-access@example.test',
        emailVerified: false,
        banned: false,
      },
      {
        id: 'banned-access',
        email: 'banned-access@example.test',
        emailVerified: true,
        banned: true,
      },
    ]) {
      await db.insert(user).values({ ...fixture, name: fixture.id })
      expect(await workspaceAccess.existingUser(fixture.email)).toBe(false)
      expect(await workspaceAccess.add(id, ownerId, fixture.email, 'editor')).toBe(false)
      expect(await workspaceAccess.read(id, fixture.id)).toBeNull()
    }
    expect(await workspaceAccess.existingUser(OTHER.email)).toBe(true)
    expect(await workspaceAccess.add(id, ownerId, OTHER.email, 'viewer')).toBe(true)
    const observed2 = await db.select().from(member).where(eq(member.organizationId, id))
    expect(observed2).toHaveLength(2)
  })
  it('accepts a bearer once per account, preserves roles, and rejects expired, revoked, and ownerless grants', async () => {
    const { db, workspaceAccess } = getServices(env)
    const { id, path } = await workspace()
    const created = workspaceLinkCreatedSchema.parse(
      await responseJson(owner.post(`${path}/links`, { role: 'editor', days: 7 })),
    )
    const token = new URL(created.url).pathname.split('/').at(-1) ?? ''
    const acceptPath = `/api/me/workspace-invitations/${token}/accept`
    expect(await responseStatus(other.post(acceptPath, {}))).toBe(200)
    expect(await responseStatus(other.post(acceptPath, {}))).toBe(200)
    const [target] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, id), eq(member.userId, otherId)))
    expect(target?.role).toBe('editor')
    const observed3 = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, id), eq(auditLog.action, 'workspace_access.accepted')))
    expect(observed3).toHaveLength(1)
    expect(await workspaceAccess.change(id, ownerId, target?.id ?? '', 'viewer')).toBe(true)
    await other.post(acceptPath, {})
    const readback = await workspaceAccess.read(id, otherId)
    expect(readback?.members.find((entry) => entry.userId === otherId)?.role).toBe('viewer')
    await db
      .update(workspaceAccessLink)
      .set({ expiresAt: new Date(0) })
      .where(eq(workspaceAccessLink.id, created.link.id))
    expect(await responseStatus(other.post(acceptPath, {}))).toBe(404)
    await db
      .update(workspaceAccessLink)
      .set({ expiresAt: new Date(Date.now() + 86_400_000) })
      .where(eq(workspaceAccessLink.id, created.link.id))
    await owner.request(`${path}/links/${created.link.id}`, { method: 'DELETE' })
    expect(await responseStatus(other.post(acceptPath, {}))).toBe(404)
    const next = workspaceLinkCreatedSchema.parse(
      await responseJson(owner.post(`${path}/links`, { role: 'viewer', days: 1 })),
    )
    await db
      .update(member)
      .set({ role: 'viewer' })
      .where(and(eq(member.organizationId, id), eq(member.userId, ownerId)))
    const nextToken = new URL(next.url).pathname.split('/').at(-1) ?? ''
    expect(
      await responseStatus(other.post(`/api/me/workspace-invitations/${nextToken}/accept`, {})),
    ).toBe(404)
    expect(await workspaceAccess.change(id, ownerId, target?.id ?? '', 'editor')).toBe(false)
  })
  it('rolls a membership grant back when its audit cannot commit', async () => {
    const { db } = getServices(env)
    const { id, path } = await workspace()
    await db.run(sql`
      CREATE TRIGGER access_audit_fixture_failure BEFORE INSERT ON audit_log
            WHEN NEW.action = 'workspace_access.added' BEGIN SELECT RAISE(ABORT, 'fixture audit write unavailable'); END
    `)
    try {
      expect(
        await responseStatus(
          owner.post(`${path}/members`, { email: OTHER.email, role: 'editor', notify: false }),
        ),
      ).toBe(500)
      const observed4 = await db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, id), eq(member.userId, otherId)))
      expect(observed4).toHaveLength(0)
    } finally {
      await db.run(sql`DROP TRIGGER access_audit_fixture_failure`)
    }
    expect(
      await responseStatus(
        owner.post(`${path}/members`, { email: OTHER.email, role: 'editor', notify: false }),
      ),
    ).toBe(204)
  })

  it('atomically caps concurrent email sends across workspaces and retains charges after revoke, failure, and deletion', async () => {
    const { db, email, devMailbox } = getServices(env)
    if (devMailbox === undefined) throw new Error('D1 fixture requires console mailbox')
    const first = await workspace()
    const second = await workspace()
    const input = { email: OTHER.email, role: 'viewer', notify: true }
    const senderCharges = and(
      eq(auditLog.actorUserId, ownerId),
      eq(auditLog.action, WORKSPACE_ACCESS_POLICY.invitationAuditAction),
    )
    const failure = vi
      .spyOn(email, 'send')
      .mockRejectedValueOnce(new Error('fixture email unavailable'))
    expect(
      await responseStatus(
        owner.post('/api/auth/organization/invite-member', {
          organizationId: first.id,
          email: OTHER.email,
          role: 'viewer',
        }),
      ),
    ).toBe(500)
    failure.mockRestore()
    const requests = Array.from(
      { length: WORKSPACE_ACCESS_POLICY.sendsPerWindow + 2 },
      (_, index) =>
        index % 2 === 0
          ? owner.post(`${first.path}/members`, input)
          : owner.post('/api/auth/organization/invite-member', {
              organizationId: second.id,
              email: OTHER.email,
              role: 'viewer',
              resend: true,
            }),
    )
    const responses = await Promise.all(requests)
    expect(responses.filter((response) => response.ok)).toHaveLength(
      WORKSPACE_ACCESS_POLICY.sendsPerWindow - 1,
    )
    expect(responses.filter((response) => response.status === 429)).toHaveLength(3)
    for (const response of responses) {
      if (response.status === 429)
        expect(response.headers.get('retry-after')).toBe(
          String(WORKSPACE_ACCESS_POLICY.sendWindowSeconds),
        )
    }
    const charges = await db.select().from(auditLog).where(senderCharges)
    expect(charges).toHaveLength(WORKSPACE_ACCESS_POLICY.sendsPerWindow)
    const delivery = devMailbox
      .messages()
      .find(
        (message) => message.to === OTHER.email && message.text.includes('/workspace-invitation/'),
      )
    const deliveredUrl = delivery?.text
      .match(/https?:\/\/\S+/g)
      ?.find((url) => url.includes('/workspace-invitation/'))
    if (deliveredUrl === undefined) throw new Error('Expected an emailed workspace invitation')
    const acceptedToken = new URL(deliveredUrl).pathname.split('/').at(-1) ?? ''
    expect(
      await responseStatus(other.post(`/api/me/workspace-invitations/${acceptedToken}/accept`, {})),
    ).toBe(200)
    const foreignKeys = await env.DB.prepare("PRAGMA foreign_key_list('audit_log')").all()
    expect(foreignKeys.results).toHaveLength(0)
    for (const workspace of [first, second]) {
      const access = workspaceAccessSchema.parse(await responseJson(owner.get(workspace.path)))
      for (const link of access.links)
        expect(
          await responseStatus(
            owner.request(`${workspace.path}/links/${link.id}`, { method: 'DELETE' }),
          ),
        ).toBe(204)
      await db.delete(organization).where(eq(organization.id, workspace.id))
      const remainingLinks = await db
        .select()
        .from(workspaceAccessLink)
        .where(eq(workspaceAccessLink.organizationId, workspace.id))
      expect(remainingLinks).toHaveLength(0)
    }
    const chargesAfterDeletion = await db.select().from(auditLog).where(senderCharges)
    expect(chargesAfterDeletion).toHaveLength(WORKSPACE_ACCESS_POLICY.sendsPerWindow)
    const third = await workspace()
    expect(await responseStatus(owner.post(`${third.path}/members`, input))).toBe(429)
    const otherWorkspace = await other.createOrganization('Other Sender', 'other-budget-sender')
    expect(
      await responseStatus(
        other.post(`/api/orgs/${otherWorkspace}/access/members`, {
          email: OWNER.email,
          role: 'viewer',
          notify: true,
        }),
      ),
    ).toBe(204)
    await db
      .update(auditLog)
      .set({ createdAt: new Date(Date.now() - WORKSPACE_ACCESS_POLICY.sendWindowMs - 1) })
      .where(senderCharges)
    expect(await responseStatus(owner.post(`${third.path}/members`, input))).toBe(204)
  })
})
