/**
 * Runtime configuration validation.
 *
 * Workers have no process-level startup hook, so validation runs on the first
 * request an isolate handles and the result is cached per `env` object. A
 * misconfigured deployment fails closed: every request gets a 500 with a
 * machine-readable code and the reason is logged once.
 */
import { z } from 'zod'

import { APP_ENVIRONMENTS, AUTH_SECRET_MIN_LENGTH, EMAIL_PROVIDERS } from '../shared/constants'

const bindingSchema = <T>(name: string) =>
  z.custom<T>((value) => typeof value === 'object' && value !== null, {
    message: `${name} binding is missing; check wrangler.jsonc`,
  })

const envSchema = z
  .object({
    APP_ENV: z.enum(APP_ENVIRONMENTS),
    /** Public origin of the app, e.g. https://watermark.blowmoney.net. Used for auth links and origin checks. */
    APP_URL: z.url({ protocol: /^https?$/ }),
    /** At least 32 characters; signs session cookies and tokens. Set with `wrangler secret put`. */
    BETTER_AUTH_SECRET: z.string().min(AUTH_SECRET_MIN_LENGTH),
    EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS),
    /** Sender address for transactional email; must belong to a zone in the Cloudflare account. */
    EMAIL_FROM: z.email(),
    DB: bindingSchema<D1Database>('DB'),
    AUTH_RATE_LIMITER: bindingSchema<RateLimit>('AUTH_RATE_LIMITER'),
    API_RATE_LIMITER: bindingSchema<RateLimit>('API_RATE_LIMITER'),
    SEND_EMAIL: bindingSchema<SendEmail>('SEND_EMAIL').optional(),
  })
  .refine((env) => env.APP_ENV !== 'production' || env.EMAIL_PROVIDER !== 'console', {
    message: 'EMAIL_PROVIDER=console is not allowed in production',
    path: ['EMAIL_PROVIDER'],
  })
  .refine((env) => env.EMAIL_PROVIDER !== 'cloudflare' || env.SEND_EMAIL !== undefined, {
    message: 'EMAIL_PROVIDER=cloudflare requires the SEND_EMAIL binding',
    path: ['SEND_EMAIL'],
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
