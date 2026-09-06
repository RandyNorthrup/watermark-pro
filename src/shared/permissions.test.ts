import { describe, expect, it } from 'vitest'

import { ASSIGNABLE_ROLES, isOrganizationRole, ORGANIZATION_ROLES, roles } from './permissions'

describe('organization roles', () => {
  it('gives owners and admins the audit trail and member management', () => {
    for (const role of [roles.owner, roles.admin]) {
      expect(role.authorize({ audit: ['read'] }).success).toBe(true)
      expect(role.authorize({ member: ['create', 'update', 'delete'] }).success).toBe(true)
      expect(role.authorize({ invitation: ['create'] }).success).toBe(true)
    }
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
    expect(ASSIGNABLE_ROLES).not.toContain('owner')
    expect(isOrganizationRole('editor')).toBe(true)
    expect(isOrganizationRole('superuser')).toBe(false)
  })
})
