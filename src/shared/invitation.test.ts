import { describe, expect, it } from 'vitest'

import { invitationIdSchema, signupSearchSchema } from './invitation'

describe('site invitation input', () => {
  it('accepts the site bearer token and keeps public signup visibly invitation-only', () => {
    expect(signupSearchSchema.parse({ invitation: 'valid_token-123' })).toEqual({
      invitation: 'valid_token-123',
    })
    expect(signupSearchSchema.parse({})).toEqual({})
  })
  it.each(['', '../other', 'id?extra=value', 'id#fragment', 'x'.repeat(201)])(
    'rejects invalid tokens %s',
    (token) => {
      expect(invitationIdSchema.safeParse(token).success).toBe(false)
    },
  )
})
