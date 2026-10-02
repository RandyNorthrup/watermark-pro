import { describe, expect, it } from 'vitest'

import { loginSearchSchema } from './client-search'
import { MAX_AUTH_REDIRECT_LENGTH } from './constants'

describe('bounded internal sign-in return destinations', () => {
  it.each(['/app', '/app/invitations', '/app/gallery?folderId=fixture'])(
    'accepts %s',
    (redirect) => {
      expect(loginSearchSchema.parse({ redirect })).toEqual({ redirect })
    },
  )
  it.each([
    'https://outside.example.test/',
    '//outside.example.test/',
    String.raw`/\outside.example.test/`,
    '/app\n/hidden',
    '/app\r/hidden',
    '/app\t/hidden',
    '/app/' + 'x'.repeat(MAX_AUTH_REDIRECT_LENGTH),
  ])('rejects foreign, ambiguous or excessive destination %j', (redirect) => {
    expect(loginSearchSchema.safeParse({ redirect }).success).toBe(false)
  })
})
