import { memoryAdapter } from 'better-auth/adapters/memory'
import { APIError } from 'better-auth/api'

import { closeAccountBilling, prepareBillingDeletion } from '../billing-lifecycle'
import { createMemoryAccountStore } from './memory-account-store'
import { createMemoryAuditStore } from './memory-audit-store'
import { createMemoryCloudStore } from './memory-cloud-store'
import { createMemoryFolderStore } from './memory-folder-store'
import { createMemoryGuidanceStore } from './memory-guidance-store'
import { createMemoryPlanStore } from './memory-plan-store'
import { createMemoryPublicAdmissionStore } from './memory-public-admission-store'
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
import { createMemoryWorkspaceAccessStore } from './memory-workspace-access-store'
import { createAuth } from '../auth/auth'
import type { DatabaseAdapter } from '../auth/options'
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
  CLOUD_TOKEN_SECRET?: string
  GOOGLE_CLOUD_CLIENT_SECRET?: string
  MICROSOFT_CLOUD_CLIENT_SECRET?: string
  DROPBOX_APP_SECRET?: string
}

export function createTestEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    APP_ENV: 'test',
    PUBLIC_SIGNUP_ENABLED: 'false',
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
  plans: ReturnType<typeof createMemoryPlanStore>
  billingTasks: Promise<void>[]
  app: ReturnType<typeof createApp>
  env: TestEnv
  services: Services
  mailbox: DevMailbox
  audit: ReturnType<typeof createMemoryAuditStore>
  objects: ReturnType<typeof createMemoryObjectStore>
}

export interface TestHarnessOptions {
  /** Fail the actual memory adapter user insertion once, through the real auth transaction. */
  userCreationFailure?: 'api' | 'unexpected'
  publicSignup?: boolean
  cloudConnections?:
    | Partial<
        Pick<
          TestEnv,
          | 'CLOUD_TOKEN_SECRET'
          | 'GOOGLE_CLOUD_CLIENT_SECRET'
          | 'MICROSOFT_CLOUD_CLIENT_SECRET'
          | 'DROPBOX_APP_SECRET'
          | 'GOOGLE_OAUTH_CLIENT_ID'
          | 'MICROSOFT_CLIENT_ID'
          | 'DROPBOX_APP_KEY'
        >
      >
    | undefined
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
    PUBLIC_SIGNUP_ENABLED: options.publicSignup === true ? 'true' : 'false',
    ...(options.captcha !== undefined && {
      TURNSTILE_SITE_KEY: options.captcha.siteKey,
      TURNSTILE_SECRET_KEY: options.captcha.secretKey,
    }),
    ...options.cloudImport,
    ...options.cloudConnections,
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
  const publicAdmissions = createMemoryPublicAdmissionStore(tables, config.BETTER_AUTH_SECRET)
  const plans = createMemoryPlanStore(tables, accounts)
  const workspaceAccess = createMemoryWorkspaceAccessStore(tables, audit, plans)
  const assets = createMemoryAssetStore()
  const photos = createMemoryPhotoStore()
  const organizations = createMemoryOrganizationStore(tables)
  const watermarks = createMemoryWatermarkStore(audit)
  const uploads = createMemoryUploadStore({
    assets,
    photos,
    organizations,
    audit,
    watermarks,
    plans,
  })
  const memoryDatabase = memoryAdapter(tables)
  let hasCreationFailure = options.userCreationFailure !== undefined
  const database: DatabaseAdapter = (configuration) => {
    const adapter = memoryDatabase(configuration)
    type TransactionAdapter = Omit<typeof adapter, 'transaction'>
    const failInsertion = (target: TransactionAdapter): TransactionAdapter => ({
      ...target,
      create: async <T extends Record<string, unknown>, R = T>(input: {
        model: string
        data: Omit<T, 'id'>
        select?: string[] | undefined
        forceAllowId?: boolean | undefined
      }): Promise<R> => {
        if (hasCreationFailure && input.model === 'user') {
          hasCreationFailure = false
          if (options.userCreationFailure === 'api') throw new APIError('CONFLICT')
          throw new Error('PRIVATE_ADAPTER_FAILURE_CANARY')
        }
        return await target.create<T, R>(input)
      },
    })
    return {
      ...failInsertion(adapter),
      transaction: async (callback) =>
        await adapter.transaction(
          async (transaction) => await callback(failInsertion(transaction)),
        ),
    }
  }
  const billingTasks: Promise<void>[] = []
  const auth = createAuth({
    database,
    secret: config.BETTER_AUTH_SECRET,
    appUrl: config.APP_URL,
    email: mailbox,
    accounts,
    plans,
    publicSignup: options.publicSignup === true ? publicAdmissions : undefined,
    reserveWorkspaceInvitation: async (organizationId, actorId, invitationId) =>
      await workspaceAccess.reserveInvitationEmail(organizationId, actorId, invitationId),
    accountOAuth: options.accountOAuth,
    hasWorkspaceContent: async (organizationId) => await uploads.hasContent(organizationId),
    audit,
    rateLimit: unlimitedRateLimitStorage,
    rateLimitEnabled: false,
    canSignUpWithoutInvitation: options.publicSignup !== true && options.invitationOnly !== true,
    closeBillingForDeletion: async (userId) => await prepareBillingDeletion(services, userId),
    closeBillingAfterBan: (userId) => {
      billingTasks.push(
        (async () => {
          try {
            await closeAccountBilling(services.billing, userId)
          } catch {
            // The named fixture retains failed closure for explicit retry assertions.
          }
        })(),
      )
      return Promise.resolve()
    },
    ...(options.captcha !== undefined && {
      captcha: {
        secretKey: options.captcha.secretKey,
        siteVerifyUrl: options.captcha.siteVerifyUrl,
      },
    }),
  })
  const objects = createMemoryObjectStore()
  const services: Services = {
    billing: {
      store: {
        reserve: () => Promise.reject(new Error('No billing boundary fixture.')),
        get: () => Promise.resolve(null),
        forOrganization: () => Promise.resolve(null),
        forOwner: () => Promise.resolve(null),
        bannedChargeable: () => Promise.resolve([]),
        isActivePayer: () => Promise.resolve(true),
        personal: () => Promise.resolve(null),
        workspace: () => Promise.resolve(null),
        replace: () => Promise.reject(new Error('No billing boundary fixture.')),
        bindCustomer: () => Promise.reject(new Error('No billing boundary fixture.')),
        bindCheckout: () => Promise.reject(new Error('No billing boundary fixture.')),
        claimEvent: () => Promise.reject(new Error('No billing boundary fixture.')),
        finishIgnoredEvent: () => Promise.reject(new Error('No billing boundary fixture.')),
        acquire: () => Promise.reject(new Error('No billing boundary fixture.')),
        release: () => Promise.reject(new Error('No billing boundary fixture.')),
        reconcile: () => Promise.reject(new Error('No billing boundary fixture.')),
      },
      provider: undefined,
    },
    publicAdmissions,
    plans,
    config,
    db: notABinding(),
    auth,
    email: mailbox,
    accounts,
    audit,
    workspaceAccess,
    cloud: createMemoryCloudStore(),
    folders: createMemoryFolderStore(tables, photos, watermarks, audit),
    guidance: createMemoryGuidanceStore(),
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
  return { app, env, services, mailbox, audit, objects, plans, billingTasks }
}
