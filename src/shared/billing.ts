import { z } from 'zod'

/** Limits and protocol choices apply at the server boundary, independently of browser inputs. */
export const BILLING_POLICY = {
  apiVersion: '2026-08-26.dahlia',
  requestBytes: 4096,
  webhookBytes: 65_536,
  signatureToleranceSeconds: 300,
  providerTimeoutMs: 10_000,
  leaseMs: 120_000,
  checkoutLifetimeSeconds: 3600,
  maximumPaidPeriodSeconds: 2_764_800,
  millisecondsPerSecond: 1000,
  centsPerDollar: 100,
  identifierCharacters: 255,
  workspaceNameCharacters: 100,
  webhookPath: '/api/billing/stripe/webhook',
  authorityMetadataKey: 'lumafoil_authority',
  checkoutMetadataKey: 'lumafoil_checkout',
  deletionMarkerPrefix: 'billing-account-removal-',
} as const

const identity = z.string().min(1).max(BILLING_POLICY.identifierCharacters)
const billingPaidPlanSchema = z.enum(['pro', 'team'])
export type BillingPaidPlan = z.infer<typeof billingPaidPlanSchema>

/** An unconfigured installation preserves Free/private grants while refusing billing mutations. */
export const stripeConfigurationSchema = z
  .object({
    accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/),
    liveMode: z.boolean(),
    secretKey: z.string().regex(/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+$/),
    webhookSecret: z.string().regex(/^whsec_[A-Za-z0-9]+$/),
    proPriceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
    teamPriceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
    portalConfigurationId: z.string().regex(/^bpc_[A-Za-z0-9]+$/),
  })
  .strict()
  .refine((value) => value.secretKey.includes(value.liveMode ? '_live_' : '_test_'), {
    message: 'Stripe secret key mode must match the pinned billing mode.',
  })
  .refine((value) => value.proPriceId !== value.teamPriceId, {
    message: 'Pro and Team require different prices.',
  })
export type StripeConfiguration = z.infer<typeof stripeConfigurationSchema>

/** Financial authority stays server-side; members receive projected capacity only. */
export const billingAuthoritySchema = z.object({
  id: identity,
  organizationId: identity.nullable(),
  ownerId: identity.nullable(),
  accountId: identity,
  liveMode: z.boolean(),
  plan: billingPaidPlanSchema,
  requestId: z.uuid(),
  newWorkspaceName: z.string().nullable(),
  customerId: identity.nullable(),
  checkoutSessionId: identity.nullable(),
  checkoutExpiresAt: z.date(),
  checkoutState: z.enum(['none', 'open', 'complete', 'expired']),
  chargeable: z.boolean(),
  subscriptionId: identity.nullable(),
  subscriptionStatus: z.string(),
  paidThrough: z.date().nullable(),
  suspended: z.boolean(),
  cancelAtPeriodEnd: z.boolean(),
  invoiceId: identity.nullable(),
  revision: z.number().int().nonnegative(),
})
export type BillingAuthority = z.infer<typeof billingAuthoritySchema>

/** Signed event envelopes are bounded before this schema reads their opaque object. */
export const stripeEventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9]+$/),
  type: z.string().max(BILLING_POLICY.identifierCharacters),
  created: z.number().int().nonnegative(),
  livemode: z.boolean(),
  account: identity.optional(),
  context: identity.optional(),
  data: z.object({ object: z.looseObject({ id: identity }) }),
})
export type BillingEvent = z.infer<typeof stripeEventSchema>

/** Administrative removal accepts only an authorized local identity, never provider identifiers. */
export const billingRemovalRequestSchema = z
  .object({ userId: z.string().min(1).max(BILLING_POLICY.identifierCharacters) })
  .strict()
