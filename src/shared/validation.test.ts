import { describe, expect, it } from 'vitest'

import { PASSWORD_MIN_LENGTH } from './constants'
import { newOrganizationSchema, signUpSchema, slugify } from './validation'

describe('slugify', () => {
  it('lowercases, strips accents and collapses separators', () => {
    expect(slugify('  Ünïcode  Studio!! ')).toBe('unicode-studio')
    expect(slugify('Acme---Photo')).toBe('acme-photo')
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(slugify('***')).toBe('')
  })
})

describe('signUpSchema', () => {
  it('explains a short password', () => {
    const result = signUpSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain(String(PASSWORD_MIN_LENGTH))
  })

  it('accepts a valid sign-up', () => {
    expect(
      signUpSchema.safeParse({ name: ' Ann ', email: 'ann@b.co', password: 'twelve chars ok' })
        .success,
    ).toBe(true)
  })
})

describe('newOrganizationSchema', () => {
  it('rejects slugs with uppercase or double hyphens', () => {
    expect(newOrganizationSchema.safeParse({ name: 'Acme', slug: 'Acme' }).success).toBe(false)
    expect(newOrganizationSchema.safeParse({ name: 'Acme', slug: 'ac--me' }).success).toBe(false)
    expect(newOrganizationSchema.safeParse({ name: 'Acme', slug: 'ac-me-2' }).success).toBe(true)
  })
})
