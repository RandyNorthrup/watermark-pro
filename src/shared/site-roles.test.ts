import { describe, expect, it } from 'vitest'

import { siteInvitationDtoSchema, siteInvitationRequestSchema } from './api-accounts'
import { assignableSiteRoleSchema, canManageSite, siteRoleSchema } from './site-roles'

describe('site role boundaries', () => {
  it.each(['owner', 'admin'])('grants site management to %s', (role) => {
    expect(canManageSite(role)).toBe(true)
    expect(siteRoleSchema.parse(role)).toBe(role)
  })
  it.each(['user', 'editor', 'viewer', 'owner,admin', null, undefined])(
    'refuses site management for %s',
    (role) => expect(canManageSite(role)).toBe(false),
  )
  it('defaults invitations to User and refuses assigning ownership', () => {
    expect(siteInvitationRequestSchema.parse({ email: 'invite@example.test' })).toEqual({
      email: 'invite@example.test',
      role: 'user',
    })
    expect(
      siteInvitationRequestSchema.parse({ email: 'invite@example.test', role: 'admin' }).role,
    ).toBe('admin')
    expect(assignableSiteRoleSchema.safeParse('owner').success).toBe(false)
    expect(
      siteInvitationRequestSchema.safeParse({ email: 'invite@example.test', role: 'owner' })
        .success,
    ).toBe(false)
    expect(siteRoleSchema.safeParse('editor').success).toBe(false)
  })
  it('requires the server to disclose the granted invitation role', () => {
    const record = {
      id: 'invitation',
      email: 'invite@example.test',
      status: 'pending',
      createdAt: '2026-09-10T00:00:00.000Z',
      expiresAt: '2026-09-17T00:00:00.000Z',
    }
    expect(siteInvitationDtoSchema.safeParse(record).success).toBe(false)
    expect(siteInvitationDtoSchema.parse({ ...record, role: 'admin' }).role).toBe('admin')
    expect(siteInvitationDtoSchema.safeParse({ ...record, role: 'owner' }).success).toBe(false)
  })
})
