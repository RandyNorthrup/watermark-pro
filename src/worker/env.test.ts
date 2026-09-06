import { describe, expect, it } from 'vitest'

import { EnvValidationError, validateEnv } from './env'
import { createTestEnv } from './test-support/test-app'

describe('validateEnv', () => {
  it('accepts every documented environment name', () => {
    for (const name of ['development', 'test', 'staging']) {
      expect(validateEnv(createTestEnv({ APP_ENV: name })).APP_ENV).toBe(name)
    }
    expect(
      validateEnv(createTestEnv({ APP_ENV: 'production', EMAIL_PROVIDER: 'cloudflare' })).APP_ENV,
    ).toBe('production')
  })

  it('throws a descriptive EnvValidationError for an unknown environment', () => {
    expect(() => validateEnv(createTestEnv({ APP_ENV: 'prod' }))).toThrow(EnvValidationError)
    expect(() => validateEnv(createTestEnv({ APP_ENV: 'prod' }))).toThrow(/APP_ENV/)
  })

  it('throws when required variables are missing entirely', () => {
    expect(() => validateEnv({})).toThrow(EnvValidationError)
  })

  it('refuses the console email provider in production', () => {
    expect(() =>
      validateEnv(createTestEnv({ APP_ENV: 'production', EMAIL_PROVIDER: 'console' })),
    ).toThrow(/EMAIL_PROVIDER/)
  })

  it('requires the SEND_EMAIL binding for the cloudflare provider', () => {
    const env = createTestEnv({ EMAIL_PROVIDER: 'cloudflare' })
    const { SEND_EMAIL: _unused, ...withoutBinding } = env
    expect(() => validateEnv(withoutBinding)).toThrow(/SEND_EMAIL/)
  })

  it('rejects a short auth secret and a non-http app URL', () => {
    expect(() => validateEnv(createTestEnv({ BETTER_AUTH_SECRET: 'short' }))).toThrow(
      /BETTER_AUTH_SECRET/,
    )
    expect(() => validateEnv(createTestEnv({ APP_URL: 'ftp://example.test' }))).toThrow(/APP_URL/)
  })

  it('caches the validated result per env object', () => {
    const raw = createTestEnv()
    expect(validateEnv(raw)).toBe(validateEnv(raw))
  })
})
