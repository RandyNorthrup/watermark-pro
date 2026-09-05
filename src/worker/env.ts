/**
 * Runtime configuration validation.
 *
 * Workers have no process-level startup hook, so validation runs on the first
 * request an isolate handles and the result is cached per `env` object. A
 * misconfigured deployment fails closed: every request gets a 500 with a
 * machine-readable code and the reason is logged once.
 */
import { z } from 'zod'

import { APP_ENVIRONMENTS } from '../shared/constants'

const envSchema = z.object({
  APP_ENV: z.enum(APP_ENVIRONMENTS),
})

export type ValidatedEnv = z.infer<typeof envSchema>

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError'
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`Invalid Worker configuration: ${issues.join('; ')}`)
    this.issues = issues
  }
}

const cache = new WeakMap<object, ValidatedEnv>()

/**
 * Parses and caches the Worker environment.
 *
 * @throws {EnvValidationError} when any binding or variable is missing or malformed.
 */
export function validateEnv(raw: object): ValidatedEnv {
  const cached = cache.get(raw)
  if (cached !== undefined) {
    return cached
  }
  const result = envSchema.safeParse(raw)
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }
  cache.set(raw, result.data)
  return result.data
}
