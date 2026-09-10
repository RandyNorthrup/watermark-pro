import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearPendingInvitation, pendingInvitation, rememberInvitation } from './pending-invitation'

afterEach(() => {
  vi.restoreAllMocks()
  clearPendingInvitation()
})

describe('OAuth invitation retry context', () => {
  it('retains a valid invitation in this tab and clears it after authentication', () => {
    expect(pendingInvitation()).toBeUndefined()
    rememberInvitation('fixture-invitation')
    expect(pendingInvitation()).toBe('fixture-invitation')
    clearPendingInvitation()
    expect(pendingInvitation()).toBeUndefined()
  })
  it('rejects malformed stored values and handles unavailable browser storage', () => {
    sessionStorage.setItem('lumafoil:pending-invitation', '../invalid')
    expect(pendingInvitation()).toBeUndefined()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(pendingInvitation()).toBeUndefined()
    expect(() => rememberInvitation('fixture-invitation')).not.toThrow()
    expect(() => clearPendingInvitation()).not.toThrow()
  })
})
