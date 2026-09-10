import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { siteOwner, user } from './db/schema'
import { createApp } from './index'
import { getServices } from './services'
import { TestClient } from './test-support/client'
import { responseStatus } from './test-support/response'

const services = getServices(env)
const app = createApp()
const owner = new TestClient(app, env)
const member = new TestClient(app, env)
const ownerEmail = 'sole-admin@example.test'
const memberEmail = 'private-owner@example.test'
let ownerId: string
let memberId: string

beforeAll(async () => {
  const mailbox = services.devMailbox
  if (mailbox === undefined) throw new Error('Expected isolated console email')
  await owner.signUpAndVerify(mailbox, {
    name: 'Site owner',
    email: ownerEmail,
    password: 'site administrator passphrase',
  })
  await member.signUpAndVerify(mailbox, {
    name: 'Workspace owner',
    email: memberEmail,
    password: 'private workspace passphrase',
  })
  const rows = await services.db.query.user.findMany()
  const administrator = rows.find((row) => row.email === ownerEmail)
  const ordinary = rows.find((row) => row.email === memberEmail)
  if (administrator === undefined || ordinary === undefined)
    throw new Error('Missing fixture users')
  ownerId = administrator.id
  memberId = ordinary.id
  expect(await services.users.promoteToSiteOwner(ownerEmail)).toBe(true)
})

describe('immutable owner and delegated administrators over D1 and real authentication', () => {
  it('anchors the owner and refuses every second-owner API entry point', async () => {
    expect(await services.accounts.siteOwnerId()).toBe(ownerId)
    expect(await services.users.promoteToSiteOwner(memberEmail)).toBe(false)
    for (const [path, body] of [
      ['/api/auth/admin/set-role', { userId: memberId, role: 'owner' }],
      ['/api/auth/admin/set-role', { userId: memberId, role: ['user', 'admin'] }],
      ['/api/auth/admin/update-user', { userId: memberId, data: { role: 'owner' } }],
      [
        '/api/auth/admin/create-user',
        {
          name: 'Second admin',
          email: 'second@example.test',
          password: 'a second admin password',
          role: 'owner',
        },
      ],
    ] as const) {
      expect(await responseStatus(owner.post(path, body))).toBe(403)
    }
    expect(await services.db.query.siteOwner.findMany()).toMatchObject([{ id: 1, userId: ownerId }])
    const users = await services.db.query.user.findMany()
    expect(users.filter((row) => row.role === 'owner').map((row) => row.id)).toEqual([ownerId])
    expect(users.filter((row) => row.role === 'admin')).toHaveLength(0)
    expect(users.find((row) => row.id === memberId)?.role).toBe('user')
  })
  it('keeps workspace owners ordinary and aggregate counts inaccessible', async () => {
    expect(await responseStatus(member.post('/api/me/workspace', {}))).toBe(200)
    expect(await responseStatus(member.get('/api/admin/account-stats'))).toBe(403)
    expect(await responseStatus(member.get('/api/auth/admin/list-users'))).toBe(403)
    expect(await responseStatus(owner.get('/api/admin/account-stats'))).toBe(200)
  })
  it('enforces the same singleton directly in D1, including mixed roles and anchor changes', async () => {
    await expect(
      services.db.update(user).set({ role: 'owner' }).where(eq(user.id, memberId)),
    ).rejects.toThrow()
    await expect(
      services.db.update(user).set({ role: 'user,admin' }).where(eq(user.id, memberId)),
    ).rejects.toThrow()
    await expect(
      services.db.update(user).set({ role: 'user' }).where(eq(user.id, ownerId)),
    ).rejects.toThrow()
    await expect(services.db.delete(user).where(eq(user.id, ownerId))).rejects.toThrow()
    await expect(services.db.update(siteOwner).set({ userId: memberId })).rejects.toThrow()
    await expect(services.db.delete(siteOwner)).rejects.toThrow()
    await expect(
      services.db.insert(user).values({
        id: 'second-admin-fixture',
        name: 'Other',
        email: 'other-admin@example.test',
        emailVerified: true,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow()
    expect(await services.accounts.siteOwnerId()).toBe(ownerId)
  })
  it('protects the anchored administrator and other users identity recovery', async () => {
    for (const [path, body] of [
      ['/api/auth/admin/set-role', { userId: ownerId, role: 'user' }],
      ['/api/auth/admin/ban-user', { userId: ownerId, banReason: 'test' }],
      ['/api/auth/admin/remove-user', { userId: ownerId }],
      [
        '/api/auth/admin/set-user-password',
        { userId: memberId, newPassword: 'administrator must not choose another password' },
      ],
      ['/api/auth/admin/update-user', { userId: memberId, data: { email: ownerEmail } }],
    ] as const)
      expect(await responseStatus(owner.post(path, body))).toBe(403)
    const row = await services.db.query.user.findFirst({ where: eq(user.id, memberId) })
    expect(row?.email).toBe(memberEmail)
  })
  it('lets an appointed administrator manage the site without owner mutation or private workspace access', async () => {
    expect(
      await responseStatus(
        owner.post('/api/auth/admin/set-role', { userId: memberId, role: 'admin' }),
      ),
    ).toBe(200)
    expect(await responseStatus(member.get('/api/admin/account-stats'))).toBe(200)
    expect(
      await responseStatus(
        member.post('/api/auth/admin/update-user', {
          userId: ownerId,
          data: { name: 'Changed owner' },
        }),
      ),
    ).toBe(403)
    expect(
      await responseStatus(
        member.post('/api/auth/admin/revoke-user-sessions', { userId: ownerId }),
      ),
    ).toBe(403)
    expect(
      await responseStatus(member.post('/api/auth/admin/list-user-sessions', { userId: ownerId })),
    ).toBe(403)
    expect(
      await responseStatus(
        member.post('/api/auth/admin/set-role', { userId: memberId, role: 'user' }),
      ),
    ).toBe(200)
    expect(await responseStatus(member.get('/api/admin/account-stats'))).toBe(403)
  })
})
