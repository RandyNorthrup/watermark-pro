/**
 * Per-isolate service container. Everything here depends on the request
 * `env` (bindings and variables), so it is built lazily on the first request
 * and cached for the lifetime of the isolate, keyed on the env object.
 */
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

import type { AuditStore } from './audit'
import { type Auth, createAuth } from './auth/auth'
import { createBindingRateLimitStorage } from './auth/rate-limit'
import { createDrizzleAuditStore } from './db/audit-store'
import { createDatabase, type Database } from './db/client'
import * as schema from './db/schema'
import { createCloudflareEmailSender } from './email/cloudflare'
import { createConsoleEmailSender, type DevMailbox } from './email/console'
import type { EmailSender } from './email/sender'
import { validateEnv, type ValidatedEnv } from './env'

export interface Services {
  config: ValidatedEnv
  db: Database
  auth: Auth
  email: EmailSender
  audit: AuditStore
  /** Present only with the console email provider (development and test). */
  devMailbox: DevMailbox | undefined
}

const cache = new WeakMap<object, Services>()

function createEmailSender(config: ValidatedEnv): {
  email: EmailSender
  devMailbox: DevMailbox | undefined
} {
  switch (config.EMAIL_PROVIDER) {
    case 'console': {
      const mailbox = createConsoleEmailSender()
      return { email: mailbox, devMailbox: mailbox }
    }
    case 'cloudflare': {
      if (config.SEND_EMAIL === undefined) {
        // Unreachable: env validation refines this combination away. Kept as
        // a thrown error rather than a cast so the type system stays honest.
        throw new Error('SEND_EMAIL binding is required for the cloudflare email provider')
      }
      return {
        email: createCloudflareEmailSender(config.SEND_EMAIL, config.EMAIL_FROM),
        devMailbox: undefined,
      }
    }
  }
}

export function buildServices(config: ValidatedEnv): Services {
  const db = createDatabase(config.DB)
  const audit = createDrizzleAuditStore(db)
  const { email, devMailbox } = createEmailSender(config)
  const auth = createAuth({
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    secret: config.BETTER_AUTH_SECRET,
    appUrl: config.APP_URL,
    email,
    audit,
    rateLimit: createBindingRateLimitStorage(config.AUTH_RATE_LIMITER, config.API_RATE_LIMITER),
    rateLimitEnabled: true,
  })
  return { config, db, auth, email, audit, devMailbox }
}

/**
 * Returns the services for this env, validating configuration on first use.
 *
 * @throws {EnvValidationError} when the environment is invalid.
 */
export function getServices(rawEnv: object): Services {
  const cached = cache.get(rawEnv)
  if (cached !== undefined) {
    return cached
  }
  const services = buildServices(validateEnv(rawEnv))
  cache.set(rawEnv, services)
  return services
}
