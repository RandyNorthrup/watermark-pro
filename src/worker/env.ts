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
    /** Public origin of the app, e.g. https://lumafoil.com. Used for auth links and origin checks. */
    APP_URL: z.url({ protocol: /^https?$/ }),
    /** At least 32 characters; signs session cookies and tokens. Set with `wrangler secret put`. */
    BETTER_AUTH_SECRET: z.string().min(AUTH_SECRET_MIN_LENGTH),
    EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS),
    /** Sender address for transactional email; must belong to a zone in the Cloudflare account. */
    EMAIL_FROM: z.email(),
    DB: bindingSchema<D1Database>('DB'),
    BUCKET: bindingSchema<R2Bucket>('BUCKET'),
    AUTH_RATE_LIMITER: bindingSchema<RateLimit>('AUTH_RATE_LIMITER'),
    API_RATE_LIMITER: bindingSchema<RateLimit>('API_RATE_LIMITER'),
    IMPORT_RATE_LIMITER: bindingSchema<RateLimit>('IMPORT_RATE_LIMITER'),
    SEND_EMAIL: bindingSchema<SendEmail>('SEND_EMAIL').optional(),
    /** Cloudflare Turnstile: set both keys to protect sign-up and password reset; leave both unset to disable. */
    TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    /** Dedicated confidential OAuth clients for account identity, independent from file providers. */
    GOOGLE_AUTH_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_AUTH_CLIENT_SECRET: z.string().min(1).optional(),
    MICROSOFT_AUTH_CLIENT_ID: z.string().min(1).optional(),
    MICROSOFT_AUTH_CLIENT_SECRET: z.string().min(1).optional(),
    MICROSOFT_AUTH_TENANT_ID: z.string().min(1).optional(),
    /** Cloud import pickers (M16): each provider is offered only when its keys are set; all optional. */
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_PICKER_API_KEY: z.string().min(1).optional(),
    GOOGLE_PICKER_APP_ID: z.string().min(1).optional(),
    MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
    DROPBOX_APP_KEY: z.string().min(1).optional(),
  })
  .refine(
    (env) => (env.TURNSTILE_SITE_KEY === undefined) === (env.TURNSTILE_SECRET_KEY === undefined),
    {
      message: 'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be set together',
      path: ['TURNSTILE_SECRET_KEY'],
    },
  )
  .refine(
    (env) =>
      (env.GOOGLE_AUTH_CLIENT_ID === undefined) === (env.GOOGLE_AUTH_CLIENT_SECRET === undefined),
    {
      message: 'GOOGLE_AUTH_CLIENT_ID and GOOGLE_AUTH_CLIENT_SECRET must be set together',
      path: ['GOOGLE_AUTH_CLIENT_SECRET'],
    },
  )
  .refine(
    (env) =>
      (env.MICROSOFT_AUTH_CLIENT_ID === undefined) ===
      (env.MICROSOFT_AUTH_CLIENT_SECRET === undefined),
    {
      message: 'MICROSOFT_AUTH_CLIENT_ID and MICROSOFT_AUTH_CLIENT_SECRET must be set together',
      path: ['MICROSOFT_AUTH_CLIENT_SECRET'],
    },
  )
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
