import { z } from 'zod'

const billingClientLimits = { identifierCharacters: 255, workspaceNameCharacters: 100 } as const
const workspaceId = z.string().min(1).max(billingClientLimits.identifierCharacters)

/** Only product intent crosses the browser boundary; prices, customer IDs and returns stay server-owned. */
export const billingCheckoutRequestSchema = z.union([
  z.object({ requestId: z.uuid(), plan: z.literal('pro') }).strict(),
  z.object({ requestId: z.uuid(), plan: z.literal('team'), organizationId: workspaceId }).strict(),
  z
    .object({
      requestId: z.uuid(),
      plan: z.literal('team'),
      newWorkspaceName: z.string().trim().min(1).max(billingClientLimits.workspaceNameCharacters),
    })
    .strict(),
])

/** Scope selects only the caller's financial authority, including paid pre-workspace Team intent. */
export const billingScopeRequestSchema = z.object({ plan: z.enum(['pro', 'team']) }).strict()
/** Billing controls are server decisions; capacity never determines a purchased scope. */
export const billingStatusSchema = z.object({
  organizationId: workspaceId.nullable(),
  workspaceName: z.string().nullable(),
  kind: z.enum(['personal', 'shared']),
  plan: z.enum(['free', 'pro', 'team']),
  subscriptionStatus: z.string(),
  paidThrough: z.iso.datetime().nullable(),
  suspended: z.boolean(),
  cancelAtPeriodEnd: z.boolean(),
  canManageBilling: z.boolean(),
  canCheckout: z.boolean(),
  checkoutState: z.enum(['none', 'open', 'complete', 'expired']),
})
export const billingOverviewSchema = z.object({
  configured: z.boolean(),
  personal: billingStatusSchema,
  team: billingStatusSchema.nullable(),
})

/** Redirect only to Stripe's hosted surfaces; reject credentials, ports and other origins. */
export const billingRedirectSchema = z
  .object({
    url: z.url().refine((value) => {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        ['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname) &&
        url.username === '' &&
        url.password === '' &&
        url.port === ''
      )
    }),
  })
  .strict()
