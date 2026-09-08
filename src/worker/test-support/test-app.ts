/**
 * Builds a fully functional application for Node unit tests: real Hono
 * routing, real Better Auth on the in-memory adapter, in-memory audit store,
 * console mailbox, and no rate limiting (there is no binding to consult).
 * Everything that talks to a Cloudflare binding is exercised separately in
 * the Workers test project.
 */
import { memoryAdapter } from 'better-auth/adapters/memory'

import { createAuth } from '../auth/auth'
import { type RateLimitStorage, unlimitedRateLimitStorage } from '../auth/rate-limit'
import { createConsoleEmailSender, type DevMailbox } from '../email/console'
import { validateEnv } from '../env'
import { createApp } from '../index'
import type { ImportLimiter, Services } from '../services'
import { createMemoryAuditStore } from './memory-audit-store'
import {
  createMemoryAssetStore,
  createMemoryObjectStore,
  createMemoryObservabilityStore,
  createMemoryOrganizationStore,
  createMemoryUserStore,
  createMemoryPhotoStore,
  createMemoryShareStore,
  createMemoryWatermarkStore,
} from './memory-stores'

export const TEST_APP_URL = 'http://localhost:5273'
export const TEST_SECRET = 'test-secret-with-at-least-thirty-two-characters'

/**
 * Binding placeholder. The memory adapter never touches these and the env
 * validator only checks that a binding is an object, so an empty object
 * stands in. The `never` cast is the single place test code pretends to hold
 * a Cloudflare binding.
 */
function notABinding(): never {
  return {} as never
}

/**
 * The generated `Env` carries only the non-secret vars from wrangler.jsonc
 * (typegen deliberately ignores .dev.vars); tests add the secrets they set.
 */
export type TestEnv = Env & {
  BETTER_AUTH_SECRET: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
}

export function createTestEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    APP_ENV: 'test',
    APP_URL: TEST_APP_URL,
    BETTER_AUTH_SECRET: TEST_SECRET,
    EMAIL_PROVIDER: 'console',
    EMAIL_FROM: 'no-reply@example.test',
    DB: notABinding(),
    BUCKET: notABinding(),
    SEND_EMAIL: notABinding(),
    AUTH_RATE_LIMITER: notABinding(),
    API_RATE_LIMITER: notABinding(),
    IMPORT_RATE_LIMITER: notABinding(),
    ASSETS: notABinding(),
    ...overrides,
  }
}

export interface TestHarness {
  app: ReturnType<typeof createApp>
  env: TestEnv
  services: Services
  mailbox: DevMailbox
  audit: ReturnType<typeof createMemoryAuditStore>
  objects: ReturnType<typeof createMemoryObjectStore>
}

export interface TestHarnessOptions {
  /** Replaces the never-limiting default, for tests that exercise 429 paths. */
  rateLimit?: RateLimitStorage | undefined
  /** Replaces the always-allow import limiter, for tests that exercise the 429 path. */
  importLimiter?: ImportLimiter | undefined
  /** Enables Turnstile with the given secret; verification calls go to `siteVerifyUrl`. */
  captcha?: { secretKey: string; siteVerifyUrl: string; siteKey: string } | undefined
  /** Sets cloud-import picker vars, for tests that assert /api/config publishes them. */
  cloudImport?:
    | Partial<
        Pick<
          TestEnv,
          | 'GOOGLE_OAUTH_CLIENT_ID'
          | 'GOOGLE_PICKER_API_KEY'
          | 'GOOGLE_PICKER_APP_ID'
          | 'MICROSOFT_CLIENT_ID'
          | 'DROPBOX_APP_KEY'
        >
      >
    | undefined
}

export function createTestHarness(options: TestHarnessOptions = {}): TestHarness {
  const env = createTestEnv({
    ...(options.captcha !== undefined && {
      TURNSTILE_SITE_KEY: options.captcha.siteKey,
      TURNSTILE_SECRET_KEY: options.captcha.secretKey,
    }),
    ...options.cloudImport,
  })
  const config = validateEnv(env)
  const mailbox = createConsoleEmailSender()
  const audit = createMemoryAuditStore()
  const tables = {
    user: [],
    session: [],
    account: [],
    verification: [],
    organization: [],
    member: [],
    invitation: [],
  }
  const auth = createAuth({
    database: memoryAdapter(tables),
    secret: config.BETTER_AUTH_SECRET,
    appUrl: config.APP_URL,
    email: mailbox,
    audit,
    rateLimit: unlimitedRateLimitStorage,
    rateLimitEnabled: false,
    ...(options.captcha !== undefined && {
      captcha: {
        secretKey: options.captcha.secretKey,
        siteVerifyUrl: options.captcha.siteVerifyUrl,
      },
    }),
  })
  const objects = createMemoryObjectStore()
  const services: Services = {
    config,
    db: notABinding(),
    auth,
    email: mailbox,
    audit,
    watermarks: createMemoryWatermarkStore(),
    assets: createMemoryAssetStore(),
    photos: createMemoryPhotoStore(),
    shares: createMemoryShareStore(),
    organizations: createMemoryOrganizationStore(tables),
    users: createMemoryUserStore(tables),
    observability: createMemoryObservabilityStore(),
    objects,
    rateLimit: options.rateLimit ?? unlimitedRateLimitStorage,
    importLimiter: options.importLimiter ?? (() => Promise.resolve(true)),
    devMailbox: mailbox,
  }
  const app = createApp({ resolveServices: () => services })
  return { app, env, services, mailbox, audit, objects }
}
