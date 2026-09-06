/**
 * Builds a fully functional application for Node unit tests: real Hono
 * routing, real Better Auth on the in-memory adapter, in-memory audit store,
 * console mailbox, and no rate limiting (there is no binding to consult).
 * Everything that talks to a Cloudflare binding is exercised separately in
 * the Workers test project.
 */
import { memoryAdapter } from 'better-auth/adapters/memory'

import { createAuth } from '../auth/auth'
import { unlimitedRateLimitStorage } from '../auth/rate-limit'
import { createConsoleEmailSender, type DevMailbox } from '../email/console'
import { validateEnv } from '../env'
import { createApp } from '../index'
import type { Services } from '../services'
import { createMemoryAuditStore } from './memory-audit-store'
import {
  createMemoryAssetStore,
  createMemoryObjectStore,
  createMemoryWatermarkStore,
} from './memory-stores'

export const TEST_APP_URL = 'http://localhost:5173'
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

export function createTestEnv(overrides: Partial<Env> = {}): Env {
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
    ...overrides,
  }
}

export interface TestHarness {
  app: ReturnType<typeof createApp>
  env: Env
  services: Services
  mailbox: DevMailbox
  audit: ReturnType<typeof createMemoryAuditStore>
  objects: ReturnType<typeof createMemoryObjectStore>
}

export function createTestHarness(): TestHarness {
  const env = createTestEnv()
  const config = validateEnv(env)
  const mailbox = createConsoleEmailSender()
  const audit = createMemoryAuditStore()
  const auth = createAuth({
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      organization: [],
      member: [],
      invitation: [],
    }),
    secret: config.BETTER_AUTH_SECRET,
    appUrl: config.APP_URL,
    email: mailbox,
    audit,
    rateLimit: unlimitedRateLimitStorage,
    rateLimitEnabled: false,
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
    objects,
    devMailbox: mailbox,
  }
  const app = createApp({ resolveServices: () => services })
  return { app, env, services, mailbox, audit, objects }
}
