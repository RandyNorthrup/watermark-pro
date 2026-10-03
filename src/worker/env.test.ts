import { describe, expect, it } from 'vitest'

import { EnvValidationError, validateEnv } from './env'
import { createTestEnv } from './test-support/test-app'

describe('validateEnv', () => {
  it('keeps public signup closed by default, rejects malformed flags, and requires real challenge keys when opened', () => {
    expect(validateEnv(createTestEnv()).PUBLIC_SIGNUP_ENABLED).toBe(false)
    expect(() => validateEnv(createTestEnv({ PUBLIC_SIGNUP_ENABLED: 'yes' }))).toThrow(
      /PUBLIC_SIGNUP_ENABLED/,
    )
    expect(() => validateEnv(createTestEnv({ PUBLIC_SIGNUP_ENABLED: 'true' }))).toThrow(
      /public signup/,
    )
    expect(() =>
      validateEnv(
        createTestEnv({
          PUBLIC_SIGNUP_ENABLED: 'true',
          TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
          TURNSTILE_SECRET_KEY: 'fixture-key',
        }),
      ),
    ).toThrow(/public signup/)
    expect(
      validateEnv(
        createTestEnv({
          PUBLIC_SIGNUP_ENABLED: 'true',
          TURNSTILE_SITE_KEY: 'real-site',
          TURNSTILE_SECRET_KEY: 'real-secret',
        }),
      ).PUBLIC_SIGNUP_ENABLED,
    ).toBe(true)
  })
  it('accepts every documented environment name', () => {
    for (const name of ['development', 'test', 'staging']) {
      expect(validateEnv(createTestEnv({ APP_ENV: name })).APP_ENV).toBe(name)
    }
    expect(
      validateEnv(
        createTestEnv({
          APP_ENV: 'production',
          APP_URL: 'https://app.example.test',
          EMAIL_PROVIDER: 'cloudflare',
          TURNSTILE_SITE_KEY: 'production-site-key',
          TURNSTILE_SECRET_KEY: 'production-secret-key',
        }),
      ).APP_ENV,
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

  it('accepts Turnstile only when both keys are present', () => {
    const both = validateEnv(
      createTestEnv({ TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' }),
    )
    expect(both.TURNSTILE_SITE_KEY).toBe('site')
    expect(validateEnv(createTestEnv()).TURNSTILE_SECRET_KEY).toBeUndefined()
    expect(() => validateEnv(createTestEnv({ TURNSTILE_SITE_KEY: 'site' }))).toThrow(
      /TURNSTILE_SECRET_KEY/,
    )
    expect(() => validateEnv(createTestEnv({ TURNSTILE_SECRET_KEY: 'secret' }))).toThrow(
      /TURNSTILE_SECRET_KEY/,
    )
  })

  it('caches the validated result per env object', () => {
    const raw = createTestEnv()
    expect(validateEnv(raw)).toBe(validateEnv(raw))
  })

  it('fails closed when production human verification is missing or uses dummy keys', () => {
    const production = {
      APP_ENV: 'production',
      APP_URL: 'https://app.example.test',
      EMAIL_PROVIDER: 'cloudflare',
    }
    expect(() => validateEnv(createTestEnv(production))).toThrow(/Production requires real/)
    for (const testKey of [
      '1x00000000000000000000AA',
      '2x00000000000000000000AB',
      '3x00000000000000000000FF',
      '1x0000000000000000000000000000000AA',
      '2x0000000000000000000000000000000AA',
      '3x0000000000000000000000000000000AA',
    ]) {
      expect(() =>
        validateEnv(
          createTestEnv({
            ...production,
            TURNSTILE_SITE_KEY: testKey,
            TURNSTILE_SECRET_KEY: 'production-secret-key',
          }),
        ),
      ).toThrow(/Production requires real/)
      expect(() =>
        validateEnv(
          createTestEnv({
            ...production,
            TURNSTILE_SITE_KEY: 'production-site-key',
            TURNSTILE_SECRET_KEY: testKey,
          }),
        ),
      ).toThrow(/Production requires real/)
    }
    expect(
      validateEnv(
        createTestEnv({
          TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
          TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        }),
      ).APP_ENV,
    ).toBe('test')
  })

  it('refuses insecure production origins even when real challenge keys are present', () => {
    expect(() =>
      validateEnv(
        createTestEnv({
          APP_ENV: 'production',
          EMAIL_PROVIDER: 'cloudflare',
          TURNSTILE_SITE_KEY: 'production-site-key',
          TURNSTILE_SECRET_KEY: 'production-secret-key',
        }),
      ),
    ).toThrow(/HTTPS/)
  })
})
