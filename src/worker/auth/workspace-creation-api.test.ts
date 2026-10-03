import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { WORKSPACE_CREATION_KIND } from '../../shared/plans'
import { signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const identity = (name: string) => ({
  name,
  email: `${name}@example.test`,
  password: 'a creation capacity fixture passphrase',
})
const userSchema = z.object({ user: z.object({ id: z.string() }) })
const createdSchema = z.object({ id: z.string() })
const recordSchema = z.object({ creationOwnerId: z.string(), creationKind: z.string() })
const creation = '/api/auth/organization/create'

describe('workspace creation uses account grants rather than tenant roles or metadata', () => {
  it('uses live verification, admission and ban state, keeping paid provenance independent', async () => {
    const harness = createTestHarness()
    const actor = new TestClient(harness.app, harness.env)
    await actor.signUpAndVerify(harness.mailbox, identity('live-authority'))
    const actorId = userSchema.parse(await responseJson(actor.get('/api/auth/get-session'))).user.id
    const context = await harness.services.auth.$context
    const canCreate = async () => await harness.services.accounts.canCreateSharedWorkspace(actorId)
    expect(await canCreate()).toBe(true)
    for (const update of [
      { emailVerified: false },
      { emailVerified: true, banned: true },
      { banned: false, membershipCohort: 'pending' },
      { membershipCohort: 'public' },
    ]) {
      await context.adapter.update({
        model: 'user',
        where: [{ field: 'id', value: actorId }],
        update,
      })
      expect(await canCreate()).toBe(false)
    }
    expect(await harness.services.accounts.canCreateSharedWorkspace('unknown-account')).toBe(false)
    await context.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: actorId }],
      update: { membershipCohort: 'private' },
    })
    // This named server fixture tests counter independence, not paid activation.
    await context.adapter.create({
      model: 'organization',
      data: {
        id: 'paid-provenance',
        name: 'Paid fixture',
        slug: 'paid-provenance',
        createdAt: new Date(),
        creationOwnerId: actorId,
        creationKind: WORKSPACE_CREATION_KIND.paid,
      },
    })
    expect(await canCreate()).toBe(true)
    await context.adapter.create({
      model: 'organization',
      data: {
        id: 'historical-provenance',
        name: 'Retained fixture',
        slug: 'historical-provenance',
        createdAt: new Date(),
        creationOwnerId: actorId,
        creationKind: WORKSPACE_CREATION_KIND.historical,
      },
    })
    expect(await canCreate()).toBe(false)
  })
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member'] as const)(
    'bounds creation for a %s with real authentication',
    async (role) => {
      const harness = createTestHarness()
      const managed = await signUpOwner(harness, identity('manager'), {
        name: 'Managed',
        slug: 'managed',
      })
      const actor = new TestClient(harness.app, harness.env)
      await actor.signUpAndVerify(harness.mailbox, identity('actor'))
      const actorId = userSchema.parse(await responseJson(actor.get('/api/auth/get-session'))).user
        .id
      const managerId = userSchema.parse(
        await responseJson(managed.client.get('/api/auth/get-session')),
      ).user.id
      const context = await harness.services.auth.$context
      if (role !== 'non-member')
        await context.adapter.create({
          model: 'member',
          data: {
            id: crypto.randomUUID(),
            organizationId: managed.organizationId,
            userId: actorId,
            role,
            createdAt: new Date(),
          },
        })
      await context.adapter.update({
        model: 'user',
        where: [{ field: 'id', value: actorId }],
        update: { membershipCohort: 'public' },
      })
      const before = harness.audit.records.length
      const body = {
        name: 'My shared workspace',
        slug: 'actor-shared',
        metadata: { paidPlan: 'team', creationOwnerId: managerId, creationKind: 'personal' },
      }
      expect(await responseStatus(actor.post(creation, body))).toBe(403)
      expect(harness.audit.records).toHaveLength(before)
      await context.adapter.update({
        model: 'user',
        where: [{ field: 'id', value: actorId }],
        update: { membershipCohort: 'private' },
      })
      expect(await responseStatus(actor.post('/api/me/workspace', {}))).toBe(200)
      const response = await actor.post(creation, {
        ...body,
        userId: managerId,
        creationOwnerId: managerId,
        creationKind: WORKSPACE_CREATION_KIND.personal,
      })
      expect(response.status).toBe(200)
      const created = createdSchema.parse(await response.json())
      const stored = recordSchema.parse(
        await context.adapter.findOne({
          model: 'organization',
          where: [{ field: 'id', value: created.id }],
        }),
      )
      expect(stored).toEqual({
        creationOwnerId: actorId,
        creationKind: WORKSPACE_CREATION_KIND.shared,
      })
      expect(
        harness.audit.records.filter(
          (entry) => entry.action === 'organization.created' && entry.actorUserId === actorId,
        ),
      ).toHaveLength(1)
      expect(
        await responseStatus(actor.post(creation, { name: 'Extra', slug: 'actor-extra' })),
      ).toBe(403)
      expect(
        harness.audit.records.filter(
          (entry) => entry.action === 'organization.created' && entry.actorUserId === actorId,
        ),
      ).toHaveLength(1)
      expect(await responseStatus(actor.post('/api/me/workspace', {}))).toBe(200)
      expect(
        await responseStatus(managed.client.get(`/api/orgs/${managed.organizationId}/watermarks`)),
      ).toBe(200)
    },
  )
  it('refuses an anonymous create before writing, then permits the same operation for a private account', async () => {
    const harness = createTestHarness()
    const actor = new TestClient(harness.app, harness.env)
    const body = { name: 'Private shared', slug: 'private-shared' }
    expect(await responseStatus(actor.post(creation, body))).toBe(401)
    expect(harness.audit.records).toHaveLength(0)
    await actor.signUpAndVerify(harness.mailbox, identity('private'))
    expect(await responseStatus(actor.post(creation, body))).toBe(200)
  })
})
