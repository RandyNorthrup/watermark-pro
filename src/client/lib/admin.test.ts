import { expect, it } from 'vitest'

import { adminUserSchema, isPlatformAdmin } from './admin'

const account = {
  id: 'account',
  name: 'Account',
  email: 'account@example.test',
  emailVerified: true,
  createdAt: '2026-09-10T00:00:00.000Z',
}

it('requires an explicit canonical site role before rendering mutable account controls', () => {
  for (const role of ['owner', 'admin', 'user']) {
    expect(adminUserSchema.parse({ ...account, role }).role).toBe(role)
  }
  expect(adminUserSchema.safeParse(account).success).toBe(false)
  for (const role of [null, 'editor', 'owner,admin']) {
    expect(adminUserSchema.safeParse({ ...account, role }).success).toBe(false)
  }
})

it('grants the console only from the user’s site-management role', () => {
  expect(isPlatformAdmin({ role: 'owner' })).toBe(true)
  expect(isPlatformAdmin({ role: 'admin' })).toBe(true)
  expect(isPlatformAdmin({ role: 'user' })).toBe(false)
  expect(isPlatformAdmin({})).toBe(false)
})
