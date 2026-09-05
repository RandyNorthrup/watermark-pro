import { describe, expect, it } from 'vitest'

import { EnvValidationError, validateEnv } from './env'

describe('validateEnv', () => {
  it('accepts every documented environment name', () => {
    for (const name of ['development', 'test', 'staging', 'production']) {
      expect(validateEnv({ APP_ENV: name }).APP_ENV).toBe(name)
    }
  })

  it('throws a descriptive EnvValidationError for an unknown environment', () => {
    expect(() => validateEnv({ APP_ENV: 'prod' })).toThrow(EnvValidationError)
    expect(() => validateEnv({ APP_ENV: 'prod' })).toThrow(/APP_ENV/)
  })

  it('throws when APP_ENV is missing entirely', () => {
    expect(() => validateEnv({})).toThrow(EnvValidationError)
  })

  it('caches the validated result per env object', () => {
    const raw = { APP_ENV: 'test' }

    expect(validateEnv(raw)).toBe(validateEnv(raw))
  })
})
