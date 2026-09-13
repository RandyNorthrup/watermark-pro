import { describe, expect, it } from 'vitest'

import { canRole } from './roles'

describe('canRole', () => {
  it('mirrors the server rule set and rejects unknown or missing roles', () => {
    expect(canRole('owner', { watermark: ['delete'] })).toBe(true)
    expect(canRole('editor', { watermark: ['create'] })).toBe(true)
    expect(canRole('viewer', { watermark: ['read'] })).toBe(true)
    expect(canRole('viewer', { watermark: ['create'] })).toBe(false)
    expect(canRole('superuser', { watermark: ['read'] })).toBe(false)
    expect(canRole(null, { watermark: ['read'] })).toBe(false)
    expect(canRole(undefined, { watermark: ['read'] })).toBe(false)
  })

  it('shows workspace access management only to its owner while retaining legacy admin tools', () => {
    expect(canRole('owner', { member: ['update'], invitation: ['create', 'cancel'] })).toBe(true)
    for (const role of ['admin', 'editor', 'viewer']) {
      expect(canRole(role, { member: ['update'] })).toBe(false)
      expect(canRole(role, { invitation: ['create', 'cancel'] })).toBe(false)
    }
    expect(canRole('admin', { organization: ['update'], audit: ['read'] })).toBe(true)
  })
})
