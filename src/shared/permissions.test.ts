import { describe, expect, it } from 'vitest'

import { isOrganizationRole, ORGANIZATION_ROLES, roles } from './permissions'

describe('organization roles', () => {
  it('keeps audit access for owners and legacy workspace admins', () => {
    for (const role of [roles.owner, roles.admin]) {
      expect(role.authorize({ audit: ['read'] }).success).toBe(true)
    }
  })

  it.each(['create', 'update', 'delete'] as const)('reserves member %s for the owner', (action) => {
    expect(roles.owner.authorize({ member: [action] }).success).toBe(true)
    for (const role of [roles.admin, roles.editor, roles.viewer]) {
      expect(role.authorize({ member: [action] }).success).toBe(false)
    }
  })

  it.each(['create', 'cancel'] as const)('reserves invitation %s for the owner', (action) => {
    expect(roles.owner.authorize({ invitation: [action] }).success).toBe(true)
    for (const role of [roles.admin, roles.editor, roles.viewer]) {
      expect(role.authorize({ invitation: [action] }).success).toBe(false)
    }
  })

  it('does not provide legacy admins an alternate grant path through teams or access policy', () => {
    expect(roles.owner.authorize({ team: ['create', 'update', 'delete'] }).success).toBe(true)
    expect(roles.owner.authorize({ ac: ['create', 'update', 'delete'] }).success).toBe(true)
    expect(roles.admin.authorize({ team: ['create', 'update', 'delete'] }).success).toBe(false)
    expect(roles.admin.authorize({ ac: ['create', 'update', 'delete'] }).success).toBe(false)
    expect(
      roles.admin.authorize({ watermark: ['create', 'read', 'update', 'delete'] }).success,
    ).toBe(true)
    expect(roles.admin.authorize({ photo: ['upload', 'read', 'delete', 'export'] }).success).toBe(
      true,
    )
    expect(roles.admin.authorize({ job: ['run'], share: ['create', 'revoke'] }).success).toBe(true)
  })

  it('reserves organization deletion for owners', () => {
    expect(roles.owner.authorize({ organization: ['delete'] }).success).toBe(true)
    expect(roles.admin.authorize({ organization: ['delete'] }).success).toBe(false)
    expect(roles.admin.authorize({ organization: ['update'] }).success).toBe(true)
  })

  it('lets editors work with content but not people', () => {
    expect(roles.editor.authorize({ watermark: ['create', 'update', 'delete'] }).success).toBe(true)
    expect(roles.editor.authorize({ photo: ['upload', 'export'] }).success).toBe(true)
    expect(roles.editor.authorize({ job: ['run'] }).success).toBe(true)
    expect(roles.editor.authorize({ member: ['create'] }).success).toBe(false)
    expect(roles.editor.authorize({ audit: ['read'] }).success).toBe(false)
  })

  it('limits viewers to reading', () => {
    expect(roles.viewer.authorize({ watermark: ['read'] }).success).toBe(true)
    expect(roles.viewer.authorize({ photo: ['read'] }).success).toBe(true)
    expect(roles.viewer.authorize({ watermark: ['create'] }).success).toBe(false)
    expect(roles.viewer.authorize({ job: ['run'] }).success).toBe(false)
    expect(roles.viewer.authorize({ share: ['create'] }).success).toBe(false)
  })

  it('exposes the role catalogue consistently', () => {
    expect(ORGANIZATION_ROLES).toEqual(['owner', 'admin', 'editor', 'viewer'])
    expect(isOrganizationRole('editor')).toBe(true)
    expect(isOrganizationRole('superuser')).toBe(false)
  })
})
