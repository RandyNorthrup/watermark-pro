import { memoryAdapter } from 'better-auth/adapters/memory'

import { createMemoryAccountStore } from './memory-account-store'
import { createMemoryAuditStore } from './memory-audit-store'
import { createMemoryRecentStore } from './memory-recent-store'
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
import { createMemoryUploadStore } from './memory-upload-store'
import { createAuth } from '../auth/auth'
import { type RateLimitStorage, unlimitedRateLimitStorage } from '../auth/rate-limit'
import type { AccountOAuthConfiguration } from '../auth/social-providers'
import { createConsoleEmailSender, type DevMailbox } from '../email/console'
import { validateEnv } from '../env'
import { createApp } from '../index'
import type { ImportLimiter, Services } from '../services'

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
  GOOGLE_PICKER_API_KEY?: string
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
  accountOAuth?: AccountOAuthConfiguration | undefined
  /** Exercise real production signup admission rather than the fixture bootstrap. */
  invitationOnly?: boolean | undefined
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
  const accounts = createMemoryAccountStore(tables)
  const assets = createMemoryAssetStore()
  const photos = createMemoryPhotoStore()
  const organizations = createMemoryOrganizationStore(tables)
  const watermarks = createMemoryWatermarkStore()
  const uploads = createMemoryUploadStore({ assets, photos, organizations, audit, watermarks })
  const auth = createAuth({
    database: memoryAdapter(tables),
    secret: config.BETTER_AUTH_SECRET,
    appUrl: config.APP_URL,
    email: mailbox,
    accounts,
    accountOAuth: options.accountOAuth,
    hasWorkspaceContent: async (organizationId) => await uploads.hasContent(organizationId),
    audit,
    rateLimit: unlimitedRateLimitStorage,
    rateLimitEnabled: false,
    canSignUpWithoutInvitation: options.invitationOnly !== true,
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
    accounts,
    audit,
    recents: createMemoryRecentStore(),
    watermarks,
    assets,
    photos,
    uploads,
    shares: createMemoryShareStore(),
    organizations,
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
