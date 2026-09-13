import { z } from 'zod'

export const CLOUD_PROVIDERS = ['google', 'dropbox', 'onedrive'] as const
export const cloudProviderSchema = z.enum(CLOUD_PROVIDERS)
export type CloudProvider = z.infer<typeof cloudProviderSchema>
export const cloudAttemptIdSchema = z.uuid()
export const CLOUD_CONNECTION_STATES = ['disconnected', 'connected', 'reconnect'] as const
export type CloudConnectionState = (typeof CLOUD_CONNECTION_STATES)[number]
export const CLOUD_ATTEMPT_STATES = ['pending', 'exchanging', 'connected', 'failed'] as const
export type CloudAttemptState = (typeof CLOUD_ATTEMPT_STATES)[number]

/** Bound both provider responses and the amount of temporary OAuth state retained per account. */
export const CLOUD_OAUTH = {
  attemptLifetimeMs: 600_000,
  refreshLeaseMs: 30_000,
  refreshMarginMs: 60_000,
  refreshPollMs: 1000,
  requestTimeoutMs: 20_000,
  maxTokenLength: 32_768,
  maxProviderBodyBytes: 131_072,
  maxScopeLength: 2048,
  maxIdentityLength: 512,
  maxLabelLength: 256,
  randomBytes: 32,
  ivBytes: 12,
  encryptionBits: 256,
  keyContext: 'lumafoil-cloud-credentials-v1',
} as const

export const cloudConnectionDtoSchema = z.object({
  provider: cloudProviderSchema,
  status: z.enum(CLOUD_CONNECTION_STATES),
  isConfigured: z.boolean(),
  accessScope: z.enum(['app_folder', 'selected_files', 'drive']),
  accountLabel: z.string().max(CLOUD_OAUTH.maxLabelLength).nullable(),
  providerAccountId: z.string().max(CLOUD_OAUTH.maxIdentityLength).nullable(),
  generation: z.number().int().nonnegative(),
})
export type CloudConnectionDto = z.infer<typeof cloudConnectionDtoSchema>
export const cloudConnectionsSchema = z.object({
  connections: z.array(cloudConnectionDtoSchema).max(CLOUD_PROVIDERS.length),
})
export const cloudAccessTokenSchema = z.object({
  accessToken: z.string().min(1).max(CLOUD_OAUTH.maxTokenLength),
  expiresAt: z.iso.datetime(),
  providerAccountId: z.string().min(1).max(CLOUD_OAUTH.maxIdentityLength),
  generation: z.number().int().nonnegative(),
})
/** A competing refresh is an explicit pending state, not a failed provider request or an empty token. */
export const cloudTokenResponseSchema = z.union([
  cloudAccessTokenSchema,
  z
    .object({ isRefreshing: z.literal(true), retryAfterMs: z.literal(CLOUD_OAUTH.refreshPollMs) })
    .strict(),
])
export const cloudConnectSchema = z.object({
  id: z.uuid(),
  authorizationUrl: z.url(),
  expiresAt: z.iso.datetime(),
})
export const cloudAttemptStatusSchema = z.object({
  status: z.enum(CLOUD_ATTEMPT_STATES),
  expiresAt: z.iso.datetime(),
})
export const cloudDisconnectSchema = z.object({
  disconnected: z.literal(true),
  providerRevoked: z.boolean(),
})
export const cloudEmptyRequestSchema = z.object({}).strict()
export const cloudCancellationSchema = z.object({ cancelled: z.literal(true) })
export const cloudCallbackSchema = z
  .object({
    state: z.string().min(1).max(CLOUD_OAUTH.maxTokenLength),
    code: z.string().min(1).max(CLOUD_OAUTH.maxTokenLength).optional(),
    error: z.string().max(CLOUD_OAUTH.maxLabelLength).optional(),
  })
  .refine(
    (value) => (value.code === undefined) !== (value.error === undefined),
    'Expected one OAuth result',
  )
