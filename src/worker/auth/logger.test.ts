import { afterEach, describe, expect, it, vi } from 'vitest'

import { authenticationDiagnostic, authenticationLogger } from './logger'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('authentication diagnostics', () => {
  it.each(['warn', 'info'] as const)(
    'keeps %s diagnostics available without serializing their private arguments',
    (level) => {
      const logger = vi.spyOn(console, level).mockImplementation(vi.fn())
      authenticationLogger.log?.(level, 'Authentication status', { token: 'SECRET_CANARY' })
      expect(logger).toHaveBeenCalledWith('Authentication', {
        message: 'Authentication status',
        errors: [],
      })
    },
  )
  it('retains useful state failure classification but never logs OAuth state, token, request or user details', () => {
    const entry = authenticationDiagnostic('Failed to parse state', [
      {
        name: 'StateError',
        code: 'state_security_mismatch',
        details: { state: 'STATE_CANARY' },
        message: 'PRIVATE_MESSAGE_CANARY',
        token: 'TOKEN_CANARY',
        request: { headers: { authorization: 'AUTH_CANARY' } },
        user: { email: 'EMAIL_CANARY' },
      },
    ])
    expect(entry).toEqual({
      message: 'Failed to parse state',
      errors: [{ name: 'StateError', code: 'state_security_mismatch' }],
    })
    expect(JSON.stringify(entry)).not.toContain('CANARY')
  })
  it('redacts URL/email/credential text and rejects unknown structured codes', () => {
    const entry = authenticationDiagnostic(
      'Failure https://provider.test/?token=URL_CANARY user@example.test token=TEXT_CANARY Bearer BEARER_CANARY',
      [
        { name: 'PRIVATE_NAME_CANARY', code: 'PRIVATE_CODE_CANARY', status: 401 },
        null,
        'RAW_CANARY',
      ],
    )
    expect(entry.errors).toEqual([{ status: 401 }])
    expect(JSON.stringify(entry)).not.toContain('CANARY')
    expect(entry.message).not.toContain('user@example.test')
    expect(authenticationDiagnostic('word '.repeat(256), []).message).toHaveLength(512)
  })
  it('continues emitting errors instead of silencing the logger', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(vi.fn())
    authenticationLogger.log?.('error', 'Authentication failed', {
      name: 'APIError',
      code: 'INVITATION_REQUIRED',
      body: 'BODY_CANARY',
    })
    expect(error).toHaveBeenCalledWith('Authentication', {
      message: 'Authentication failed',
      errors: [{ name: 'APIError', code: 'INVITATION_REQUIRED' }],
    })
  })
})
