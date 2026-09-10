/** Real Better Auth sessions distinguish site authority from each user's private workspace. */
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { SITE_ROLE } from '../../shared/site-roles'
import { TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const sessionSchema = z.object({ user: z.object({ id: z.string(), role: z.string() }) })
const password = 'site role fixture passphrase'
const cases = ['owner', 'admin'] as const
let harness: ReturnType<typeof createTestHarness>
let actors: Record<'owner' | 'admin' | 'user', TestClient>
let ids: Record<'owner' | 'admin' | 'user', string>

async function roleOf(client: TestClient) {
  const response = await responseJson(client.get('/api/auth/get-session'))
  return sessionSchema.parse(response).user.role
}

beforeEach(async () => {
  harness = createTestHarness()
  actors = {
    owner: new TestClient(harness.app, harness.env),
    admin: new TestClient(harness.app, harness.env),
    user: new TestClient(harness.app, harness.env),
  }
  ids = { owner: '', admin: '', user: '' }
  for (const role of ['owner', 'admin', 'user'] as const) {
    await actors[role].signUpAndVerify(harness.mailbox, {
      name: `Site ${role}`,
      email: `${role}@roles.example.test`,
      password,
    })
    ids[role] = sessionSchema.parse(
      await responseJson(actors[role].get('/api/auth/get-session')),
    ).user.id
  }
  expect(await harness.services.users.promoteToSiteOwner('owner@roles.example.test')).toBe(true)
  expect(
    await responseStatus(
      actors.owner.post('/api/auth/admin/set-role', { userId: ids.admin, role: SITE_ROLE.admin }),
    ),
  ).toBe(200)
})

describe.each(cases)('%s site management', (role) => {
  it('can read management summaries and appoint/demote a non-owner without transferring ownership', async () => {
    const manager = actors[role]
    for (const path of [
      '/api/auth/admin/list-users',
      '/api/admin/account-stats',
      '/api/admin/organizations',
      '/api/admin/audit',
      '/api/admin/client-errors',
      '/api/admin/health',
    ])
      expect(await responseStatus(manager.get(path))).toBe(200)
    expect(
      await responseStatus(
        manager.post('/api/auth/admin/set-role', { userId: ids.user, role: 'admin' }),
      ),
    ).toBe(200)
    expect(await responseStatus(actors.user.get('/api/admin/account-stats'))).toBe(200)
    expect(
      await responseStatus(
        manager.post('/api/auth/admin/update-user', { userId: ids.user, data: { role: 'user' } }),
      ),
    ).toBe(200)
    expect(await responseStatus(actors.user.get('/api/admin/account-stats'))).toBe(403)
    const invitation = await manager.post('/api/me/invitations', {
      email: 'appointed@example.test',
      role: 'admin',
    })
    expect(invitation.status).toBe(201)
    expect(await invitation.json()).toMatchObject({ role: 'admin' })
    expect(await harness.services.accounts.siteOwnerId()).toBe(ids.owner)
    expect(await roleOf(actors.owner)).toBe('owner')
  })

  it('can create an administrator and moderate ordinary accounts', async () => {
    const manager = actors[role]
    const created = await manager.post('/api/auth/admin/create-user', {
      name: 'Appointed administrator',
      email: 'created@roles.example.test',
      role: 'admin',
    })
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ user: { role: 'admin' } })
    expect(
      await responseStatus(
        manager.post('/api/auth/admin/update-user', {
          userId: ids.user,
          data: { name: 'Updated user' },
        }),
      ),
    ).toBe(200)
    expect(
      await responseStatus(
        manager.post('/api/auth/admin/ban-user', {
          userId: ids.user,
          banReason: 'Fixture moderation',
        }),
      ),
    ).toBe(200)
    expect(
      await responseStatus(manager.post('/api/auth/admin/unban-user', { userId: ids.user })),
    ).toBe(200)
    expect(
      await responseStatus(
        manager.post('/api/auth/admin/revoke-user-sessions', { userId: ids.user }),
      ),
    ).toBe(200)
    expect(
      await responseStatus(manager.post('/api/auth/admin/remove-user', { userId: ids.user })),
    ).toBe(200)
  })

  it.each([
    ['set-role', { role: 'user' }],
    ['set-role', { role: 'admin' }],
    ['update-user', { data: { name: 'Changed owner' } }],
    ['update-user', { data: { role: 'admin' } }],
    ['update-user', { data: { email: 'changed@example.test' } }],
    ['ban-user', { banReason: 'Cannot ban owner' }],
    ['unban-user', {}],
    ['remove-user', {}],
    ['revoke-user-sessions', {}],
    ['set-user-password', { newPassword: password }],
  ])('cannot mutate the owner through %s', async (path, body) => {
    expect(
      await responseStatus(
        actors[role].post(`/api/auth/admin/${path}`, { ...body, userId: ids.owner }),
      ),
    ).toBe(403)
    expect(await responseStatus(actors.owner.get('/api/admin/account-stats'))).toBe(200)
    expect(await harness.services.accounts.siteOwnerId()).toBe(ids.owner)
  })

  it.each(['owner', 'user,admin', ['admin'], ['user', 'admin'], 'editor', null])(
    'cannot assign unsupported or ownership role %j',
    async (value) => {
      const manager = actors[role]
      for (const path of ['set-role', 'update-user'])
        expect(
          await responseStatus(
            manager.post(`/api/auth/admin/${path}`, {
              userId: ids.user,
              ...(path === 'set-role' ? { role: value } : { data: { role: value } }),
            }),
          ),
        ).toBeGreaterThanOrEqual(400)
      expect(await roleOf(actors.user)).toBe('user')
    },
  )

  it('cannot learn bearer sessions or take over account credentials', async () => {
    for (const [path, body] of [
      ['list-user-sessions', { userId: ids.user }],
      ['revoke-user-session', { sessionToken: 'private-token-canary' }],
      ['impersonate-user', { userId: ids.user }],
      ['set-user-password', { userId: ids.user, newPassword: password }],
      ['update-user', { userId: ids.user, data: { emailVerified: true } }],
    ] as const)
      expect(await responseStatus(actors[role].post(`/api/auth/admin/${path}`, body))).toBe(403)
  })

  it('has no implicit membership or content access to another private workspace', async () => {
    const workspace = await actors.user.post('/api/me/workspace', {})
    const { organizationId } = z
      .object({ organizationId: z.string() })
      .parse(await workspace.json())
    expect(
      await responseStatus(
        actors[role].get(
          `/api/auth/organization/get-full-organization?organizationId=${organizationId}`,
        ),
      ),
    ).toBe(403)
    expect(await responseStatus(actors[role].get(`/api/orgs/${organizationId}/watermarks`))).toBe(
      403,
    )
    expect(await responseStatus(actors.user.get(`/api/orgs/${organizationId}/watermarks`))).toBe(
      200,
    )
  })
})

it('self-demotion retains the ordinary session and removes management authority immediately', async () => {
  expect(
    await responseStatus(
      actors.admin.post('/api/auth/admin/set-role', { userId: ids.admin, role: 'user' }),
    ),
  ).toBe(200)
  expect(await roleOf(actors.admin)).toBe('user')
  expect(await responseStatus(actors.admin.get('/api/admin/account-stats'))).toBe(403)
  expect(
    await responseStatus(
      actors.admin.post('/api/auth/admin/set-role', { userId: ids.admin, role: 'admin' }),
    ),
  ).toBe(403)
})

it('demotion permanently revokes outstanding admin invitations while retaining ordinary invitations', async () => {
  for (const role of ['admin', 'user'])
    expect(
      await responseStatus(
        actors.admin.post('/api/me/invitations', { email: `${role}-pending@example.test`, role }),
      ),
    ).toBe(201)
  expect(
    await responseStatus(
      actors.owner.post('/api/auth/admin/set-role', { userId: ids.admin, role: 'user' }),
    ),
  ).toBe(200)
  const invitations = await harness.services.accounts.listInvitations(ids.admin)
  expect(invitations.find((record) => record.role === 'admin')?.revokedAt).toBeInstanceOf(Date)
  expect(invitations.find((record) => record.role === 'user')?.revokedAt).toBeNull()
  expect(
    await responseStatus(
      actors.owner.post('/api/auth/admin/set-role', { userId: ids.admin, role: 'admin' }),
    ),
  ).toBe(200)
  const restored = await harness.services.accounts.listInvitations(ids.admin)
  expect(restored.find((record) => record.role === 'admin')?.revokedAt).toBeInstanceOf(Date)
})

it.each(['owner', 'admin', 'editor', 'viewer'])(
  'workspace role %s grants no site authority',
  async (role) => {
    const organizationId = await actors.user.createOrganization('Separate team', 'separate-team')
    const context = await harness.services.auth.$context
    await context.adapter.update({
      model: 'member',
      where: [{ field: 'organizationId', value: organizationId }],
      update: { role },
    })
    expect(await responseStatus(actors.user.get('/api/admin/account-stats'))).toBe(403)
    expect(await responseStatus(actors.user.get('/api/auth/admin/list-users'))).toBe(403)
    expect(
      await responseStatus(
        actors.user.get(
          `/api/auth/organization/get-full-organization?organizationId=${organizationId}`,
        ),
      ),
    ).toBe(200)
  },
)

it('rejects anonymous management and a forged non-anchored owner label', async () => {
  const anonymous = new TestClient(harness.app, harness.env)
  expect(await responseStatus(anonymous.get('/api/admin/account-stats'))).toBe(401)
  expect(await responseStatus(anonymous.get('/api/auth/admin/list-users'))).toBe(401)
  const context = await harness.services.auth.$context
  await context.adapter.update({
    model: 'user',
    where: [{ field: 'id', value: ids.user }],
    update: { role: 'owner' },
  })
  expect(await responseStatus(actors.user.get('/api/admin/account-stats'))).toBe(403)
  expect(await responseStatus(actors.user.get('/api/auth/admin/list-users'))).toBe(403)
})
