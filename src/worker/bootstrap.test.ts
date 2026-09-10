import { describe, expect, it } from 'vitest'

import { ACCOUNT_ID_HEADER } from '../shared/account-identity'
import { BOOTSTRAP_PATH, bootstrapSnapshotSchema } from '../shared/bootstrap'
import { joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { responseJson } from './test-support/response'
import { createTestHarness, type TestHarness } from './test-support/test-app'

const OWNER = {
  name: 'Owner fixture',
  email: 'owner@example.test',
  password: 'correct horse battery staple',
}
const OTHER = {
  name: 'Member fixture',
  email: 'member@example.test',
  password: 'correct horse battery staple',
}

async function sessionOf(harness: TestHarness, client: TestClient) {
  const session = await harness.services.auth.api.getSession({
    headers: new Headers({ cookie: client.cookieHeader }),
  })
  if (session === null) throw new Error('Expected a real signed-in fixture session')
  return session
}

describe('single authenticated bootstrap', () => {
  it.each(['owner', 'admin', 'editor', 'viewer'] as const)(
    'preserves selected collaboration and ensures a separate personal workspace for %s',
    async (role) => {
      const harness = createTestHarness()
      const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
        name: 'Shared studio',
        slug: 'shared-studio',
      })
      const client =
        role === 'owner' ? owner : await joinAsMember(harness, owner, organizationId, OTHER, role)
      await client.post('/api/auth/organization/set-active', { organizationId })
      const before = await sessionOf(harness, client)
      const personalId = `personal-${before.user.id}`
      expect(await harness.services.accounts.isPrivateWorkspace(personalId)).toBe(false)
      const response = await client.post(BOOTSTRAP_PATH, {})
      expect(response.status).toBe(200)
      const raw: unknown = await response.json()
      const snapshot = bootstrapSnapshotSchema.parse(raw)
      expect(snapshot.session.user.id).toBe(before.user.id)
      expect(snapshot.organization?.id).toBe(organizationId)
      expect(snapshot.role).toEqual({ role })
      expect(snapshot.selectionRequired).toBe(false)
      expect(snapshot.organizations.map((organization) => organization.id)).toContain(personalId)
      expect(await harness.services.accounts.isPrivateWorkspace(personalId)).toBe(true)
      expect(
        Object.keys(snapshot.session.session).toSorted((first, second) =>
          first.localeCompare(second),
        ),
      ).toEqual(['activeOrganizationId', 'id', 'userId'])
      expect(JSON.stringify(raw)).not.toContain(before.session.token)
      for (const field of [
        'ipAddress',
        'userAgent',
        'impersonatedBy',
        'accessToken',
        'refreshToken',
      ])
        expect(JSON.stringify(raw)).not.toContain(field)
      const repeated = bootstrapSnapshotSchema.parse(
        await responseJson(client.post(BOOTSTRAP_PATH, {})),
      )
      expect(repeated.organizations.map((organization) => organization.id)).toEqual(
        snapshot.organizations.map((organization) => organization.id),
      )
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    },
  )

  it('gives a nonmember only their private workspace and defaults an unselected collaborator to personal', async () => {
    const harness = createTestHarness()
    const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
      name: 'FOREIGN_WORKSPACE_CANARY',
      slug: 'foreign-studio',
    })
    const outsider = new TestClient(harness.app, harness.env)
    await outsider.signUpAndVerify(harness.mailbox, OTHER)
    const beforeOwner = await sessionOf(harness, owner)
    const snapshot = bootstrapSnapshotSchema.parse(
      await responseJson(outsider.post(BOOTSTRAP_PATH, {})),
    )
    expect(snapshot.role).toEqual({ role: 'owner' })
    expect(snapshot.organizations).toHaveLength(1)
    expect(snapshot.organization?.id).toBe(`personal-${snapshot.session.user.id}`)
    expect(JSON.stringify(snapshot)).not.toContain('FOREIGN_WORKSPACE_CANARY')
    expect(JSON.stringify(snapshot)).not.toContain(OWNER.email)
    const ownerAfter = await sessionOf(harness, owner)
    expect(ownerAfter.session.activeOrganizationId).toBe(beforeOwner.session.activeOrganizationId)
    await owner.post('/api/auth/organization/set-active', { organizationId: null })
    const ownerSnapshot = bootstrapSnapshotSchema.parse(
      await responseJson(owner.post(BOOTSTRAP_PATH, {})),
    )
    expect(ownerSnapshot.organization?.id).toBe(`personal-${beforeOwner.user.id}`)
    expect(ownerSnapshot.organizations.map((organization) => organization.id)).toContain(
      organizationId,
    )
  })

  it('rejects anonymous, unverified, spoofed-binding and supplied-identity requests before provisioning', async () => {
    const harness = createTestHarness()
    const anonymous = new TestClient(harness.app, harness.env)
    const denied = await anonymous.post(BOOTSTRAP_PATH, {})
    expect(denied.status).toBe(401)
    expect(await denied.json()).toEqual({ error: 'unauthenticated' })
    const { client } = await signUpOwner(harness, OWNER, {
      name: 'Existing studio',
      slug: 'existing',
    })
    const original = await sessionOf(harness, client)
    const personalId = `personal-${original.user.id}`
    const mismatch = await client.request(BOOTSTRAP_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACCOUNT_ID_HEADER]: 'another-account' },
      body: '{}',
    })
    expect(mismatch.status).toBe(403)
    expect(await mismatch.json()).toEqual({ error: 'forbidden' })
    const suppliedIdentity = await client.post(BOOTSTRAP_PATH, { userId: 'another-account' })
    expect(suppliedIdentity.status).toBe(400)
    expect(await harness.services.accounts.isPrivateWorkspace(personalId)).toBe(false)
    const auth = await harness.services.auth.$context
    await auth.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: original.user.id }],
      update: { emailVerified: false },
    })
    const unverified = await client.post(BOOTSTRAP_PATH, {})
    expect(unverified.status).toBe(403)
    expect(await unverified.json()).toEqual({ error: 'forbidden' })
    expect(await harness.services.accounts.isPrivateWorkspace(personalId)).toBe(false)
  })

  it.each(['revoked', 'foreign', 'unknown'] as const)(
    'clears only the unusable %s selection and offers explicit recovery without exposing its data',
    async (kind) => {
      const harness = createTestHarness()
      const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
        name: 'FOREIGN_WORKSPACE_CANARY',
        slug: 'foreign-studio',
      })
      const member =
        kind === 'revoked'
          ? await joinAsMember(harness, owner, organizationId, OTHER, 'viewer')
          : new TestClient(harness.app, harness.env)
      if (kind !== 'revoked') await member.signUpAndVerify(harness.mailbox, OTHER)
      const memberSession = await sessionOf(harness, member)
      const ownerBefore = await sessionOf(harness, owner)
      const auth = await harness.services.auth.$context
      if (kind === 'revoked')
        await auth.adapter.delete({
          model: 'member',
          where: [
            { field: 'userId', value: memberSession.user.id },
            { field: 'organizationId', value: organizationId },
          ],
        })
      const selected = kind === 'unknown' ? 'missing-workspace' : organizationId
      await auth.adapter.update({
        model: 'session',
        where: [{ field: 'id', value: memberSession.session.id }],
        update: { activeOrganizationId: selected },
      })
      const response = await member.post(BOOTSTRAP_PATH, {})
      expect(response.status).toBe(200)
      const snapshot = bootstrapSnapshotSchema.parse(await response.json())
      expect(snapshot.selectionRequired).toBe(true)
      expect(snapshot.organization).toBeNull()
      expect(snapshot.role).toBeNull()
      expect(snapshot.session.session.activeOrganizationId).toBeNull()
      expect(JSON.stringify(snapshot)).not.toContain('FOREIGN_WORKSPACE_CANARY')
      expect(JSON.stringify(snapshot)).not.toContain(OWNER.email)
      const ownerAfter = await sessionOf(harness, owner)
      expect(ownerAfter.session.activeOrganizationId).toBe(ownerBefore.session.activeOrganizationId)
      const recovered = bootstrapSnapshotSchema.parse(
        await responseJson(member.post(BOOTSTRAP_PATH, {})),
      )
      expect(recovered.selectionRequired).toBe(false)
      expect(recovered.organization?.id).toBe(`personal-${memberSession.user.id}`)
    },
  )
})
