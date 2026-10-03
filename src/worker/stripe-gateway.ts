import { Stripe } from 'stripe'
import { z } from 'zod'

import type { BillingProviderState, BillingSnapshot } from './billing-store'
import { apiErrors } from './errors'
import {
  BILLING_POLICY,
  stripeEventSchema,
  type BillingAuthority,
  type BillingEvent,
  type BillingPaidPlan,
  type StripeConfiguration,
} from '../shared/billing'
import { PUBLIC_PLANS } from '../shared/plans'

const referenceSchema = z.union([z.string(), z.object({ id: z.string() })])
const nullableReferenceSchema = referenceSchema.nullable()
const objectIdSchema = z.object({ id: z.string(), livemode: z.boolean() })
const subscriptionItemSchema = z.object({
  quantity: z.literal(1),
  current_period_start: z.number().int(),
  current_period_end: z.number().int(),
  price: z.object({ id: z.string() }),
})
const subscriptionItemsSchema = z.object({
  has_more: z.literal(false),
  data: z.tuple([subscriptionItemSchema]),
})
const subscriptionSchema = objectIdSchema.extend({
  customer: referenceSchema,
  metadata: z.record(z.string(), z.string()),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  pause_collection: z.unknown().nullable(),
  latest_invoice: nullableReferenceSchema,
  items: subscriptionItemsSchema,
})
const invoiceParentDetailsSchema = z.object({ subscription: referenceSchema })
const invoiceParentSchema = z
  .object({ subscription_details: invoiceParentDetailsSchema.nullable() })
  .nullable()
const invoicePriceSchema = z
  .object({ price_details: z.object({ price: referenceSchema }).nullable() })
  .nullable()
const invoiceLineSchema = z.object({
  amount: z.number().int(),
  period: z.object({ start: z.number().int(), end: z.number().int() }),
  pricing: invoicePriceSchema,
})
const invoiceLinesSchema = z.object({
  has_more: z.literal(false),
  data: z.tuple([invoiceLineSchema]),
})
const invoiceSchema = objectIdSchema.extend({
  customer: referenceSchema,
  status: z.string().nullable(),
  currency: z.string(),
  amount_due: z.number().int(),
  amount_paid: z.number().int(),
  parent: invoiceParentSchema,
  lines: invoiceLinesSchema,
})
const chargeSchema = objectIdSchema.extend({
  customer: nullableReferenceSchema,
  payment_intent: nullableReferenceSchema,
  paid: z.boolean(),
  refunded: z.boolean(),
  amount_refunded: z.number().int(),
  disputed: z.boolean(),
  currency: z.string(),
  amount: z.number().int(),
})
const paymentSchema = z.object({
  invoice: referenceSchema,
  livemode: z.boolean(),
  amount_paid: z.number().int().nullable(),
  status: z.string(),
  payment: z.object({ type: z.string(), payment_intent: referenceSchema.optional() }),
})
const paymentsSchema = z.object({ has_more: z.literal(false), data: z.array(paymentSchema).max(2) })

function reference(value: z.infer<typeof referenceSchema>): string {
  return typeof value === 'string' ? value : value.id
}
function priceId(config: StripeConfiguration, plan: BillingPaidPlan): string {
  return plan === 'pro' ? config.proPriceId : config.teamPriceId
}
function assertMode(isLive: boolean, config: StripeConfiguration) {
  if (isLive !== config.liveMode) throw apiErrors.forbidden()
}
function hostedUrl(raw: string | null, host: string): string {
  const parsed = z.url().safeParse(raw)
  if (!parsed.success) throw apiErrors.retryLater()
  const url = new URL(parsed.data)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== host ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== ''
  )
    throw apiErrors.retryLater()
  return url.href
}

/** Tests inject a named provider fixture; production always uses Stripe's official SDK. */
export interface StripeGateway {
  assertAccount(purpose: 'checkout' | 'portal' | 'reconcile'): Promise<boolean>
  createCustomer(authority: BillingAuthority): Promise<string>
  createCheckout(authority: BillingAuthority, appUrl: string): Promise<{ id: string; url: string }>
  createPortal(authority: BillingAuthority, appUrl: string): Promise<string>
  verifyEvent(rawBody: string, signature: string): Promise<BillingEvent>
  eventAuthority(event: BillingEvent): Promise<{
    id: string
    requestId: string
    customerId: string
    subscriptionId: string | null
    checkoutSessionId: string | null
  } | null>
  snapshot(authority: BillingAuthority, subscriptionId: string): Promise<BillingSnapshot>
  inspect(authority: BillingAuthority): Promise<BillingProviderState>
  closeCheckout(authority: BillingAuthority): Promise<BillingProviderState>
  closeAccount(authority: BillingAuthority): Promise<BillingProviderState>
}

/** Explicit version, fetch transport and WebCrypto work in both Node and Cloudflare Workers. */
export function createStripeGateway(config: StripeConfiguration): StripeGateway {
  const stripe = new Stripe(config.secretKey, {
    apiVersion: BILLING_POLICY.apiVersion,
    httpClient: Stripe.createFetchHttpClient(),
    timeout: BILLING_POLICY.providerTimeoutMs,
    maxNetworkRetries: 0,
    telemetry: false,
  })
  async function subscription(id: string) {
    const value = subscriptionSchema.parse(await stripe.subscriptions.retrieve(id))
    assertMode(value.livemode, config)
    return value
  }
  async function invoice(id: string) {
    const value = invoiceSchema.parse(await stripe.invoices.retrieve(id))
    assertMode(value.livemode, config)
    return value
  }
  const gateway: StripeGateway = {
    async assertAccount(purpose) {
      const [account, balance] = await Promise.all([
        stripe.accounts.retrieveCurrent(),
        stripe.balance.retrieve(),
      ])
      if (
        account.id !== config.accountId ||
        balance.livemode !== config.liveMode ||
        (purpose === 'checkout' &&
          config.liveMode &&
          (!account.charges_enabled || !account.payouts_enabled))
      )
        throw apiErrors.retryLater()
      return !config.liveMode || (account.charges_enabled && account.payouts_enabled)
    },
    async createCustomer(authority) {
      const customer = await stripe.customers.create(
        {
          metadata: { [BILLING_POLICY.authorityMetadataKey]: authority.id },
        },
        { idempotencyKey: `lumafoil-customer-${authority.id}` },
      )
      assertMode(customer.livemode, config)
      return customer.id
    },
    async createCheckout(authority, appUrl) {
      if (authority.customerId === null) throw apiErrors.conflict()
      const price = await stripe.prices.retrieve(priceId(config, authority.plan))
      assertMode(price.livemode, config)
      if (
        !price.active ||
        price.currency !== 'usd' ||
        price.unit_amount !==
          PUBLIC_PLANS[authority.plan].monthlyUsd * BILLING_POLICY.centsPerDollar ||
        price.recurring?.interval !== 'month' ||
        price.recurring.interval_count !== 1 ||
        price.recurring.usage_type !== 'licensed' ||
        price.billing_scheme !== 'per_unit' ||
        price.transform_quantity !== null ||
        price.tax_behavior === 'inclusive'
      )
        throw apiErrors.retryLater()
      const metadata = {
        [BILLING_POLICY.authorityMetadataKey]: authority.id,
        [BILLING_POLICY.checkoutMetadataKey]: authority.requestId,
      }
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: authority.customerId,
          client_reference_id: authority.id,
          metadata,
          subscription_data: { metadata },
          line_items: [{ price: price.id, quantity: 1 }],
          payment_method_types: ['card'],
          allow_promotion_codes: false,
          adaptive_pricing: { enabled: false },
          expires_at: Math.floor(
            authority.checkoutExpiresAt.getTime() / BILLING_POLICY.millisecondsPerSecond,
          ),
          success_url: new URL(
            `/app/account?billing=returned&billingPlan=${authority.plan}`,
            appUrl,
          ).href,
          cancel_url: new URL(
            `/app/account?billing=cancelled&billingPlan=${authority.plan}`,
            appUrl,
          ).href,
        },
        { idempotencyKey: `lumafoil-checkout-${authority.requestId}` },
      )
      assertMode(session.livemode, config)
      if (reference(referenceSchema.parse(session.customer)) !== authority.customerId)
        throw apiErrors.forbidden()
      return { id: session.id, url: hostedUrl(session.url, 'checkout.stripe.com') }
    },
    async createPortal(authority, appUrl) {
      if (authority.customerId === null) throw apiErrors.conflict()
      const portal = await stripe.billingPortal.configurations.retrieve(
        config.portalConfigurationId,
      )
      assertMode(portal.livemode, config)
      if (
        !portal.active ||
        portal.features.subscription_update.enabled ||
        !portal.features.subscription_cancel.enabled ||
        portal.features.subscription_cancel.mode !== 'at_period_end'
      )
        throw apiErrors.retryLater()
      const session = await stripe.billingPortal.sessions.create({
        customer: authority.customerId,
        configuration: portal.id,
        return_url: new URL(`/app/account?billing=managed&billingPlan=${authority.plan}`, appUrl)
          .href,
      })
      return hostedUrl(session.url, 'billing.stripe.com')
    },
    async verifyEvent(rawBody, signature) {
      const timestamp = /(?:^|,)t=(\d+)(?:,|$)/.exec(signature)?.[1]
      const nowSeconds = Date.now() / BILLING_POLICY.millisecondsPerSecond
      if (
        timestamp === undefined ||
        Math.abs(nowSeconds - Number(timestamp)) > BILLING_POLICY.signatureToleranceSeconds
      )
        throw apiErrors.validation('Invalid Stripe signature.')
      let parsed: unknown
      try {
        parsed = await stripe.webhooks.constructEventAsync(
          rawBody,
          signature,
          config.webhookSecret,
          BILLING_POLICY.signatureToleranceSeconds,
          Stripe.createSubtleCryptoProvider(),
        )
      } catch {
        throw apiErrors.validation('Invalid Stripe signature.')
      }
      const event = stripeEventSchema.safeParse(parsed)
      if (!event.success) throw apiErrors.validation('Invalid Stripe event.')
      assertMode(event.data.livemode, config)
      if (event.data.account !== undefined || event.data.context !== undefined)
        throw apiErrors.forbidden()
      return event.data
    },
    async eventAuthority(event) {
      if (event.type.startsWith('checkout.session.')) {
        const session = await stripe.checkout.sessions.retrieve(event.data.object.id)
        assertMode(session.livemode, config)
        const id = session.metadata?.[BILLING_POLICY.authorityMetadataKey]
        const requestId = session.metadata?.[BILLING_POLICY.checkoutMetadataKey]
        if (
          id === undefined ||
          requestId === undefined ||
          session.customer === null ||
          session.mode !== 'subscription'
        )
          return null
        return {
          id,
          requestId,
          customerId: reference(referenceSchema.parse(session.customer)),
          subscriptionId:
            session.subscription === null
              ? null
              : reference(referenceSchema.parse(session.subscription)),
          checkoutSessionId: session.id,
        }
      }
      let subscriptionId: string | null = null
      if (event.type.startsWith('customer.subscription.')) subscriptionId = event.data.object.id
      else if (event.type.startsWith('invoice.')) {
        const value = await invoice(event.data.object.id)
        if (value.parent?.subscription_details?.subscription !== undefined)
          subscriptionId = reference(value.parent.subscription_details.subscription)
      } else if (event.type === 'charge.refunded' || event.type.startsWith('charge.dispute.')) {
        let chargeId = event.data.object.id
        if (event.type.startsWith('charge.dispute.')) {
          const dispute = await stripe.disputes.retrieve(chargeId)
          assertMode(dispute.livemode, config)
          chargeId = reference(referenceSchema.parse(dispute.charge))
        }
        const charge = chargeSchema.parse(await stripe.charges.retrieve(chargeId))
        assertMode(charge.livemode, config)
        if (charge.payment_intent === null) return null
        const payments = paymentsSchema.parse(
          await stripe.invoicePayments.list({
            payment: { type: 'payment_intent', payment_intent: reference(charge.payment_intent) },
            limit: 2,
          }),
        )
        if (payments.data.length !== 1) return null
        const payment = payments.data[0]
        if (payment === undefined) throw apiErrors.conflict()
        const value = await invoice(reference(payment.invoice))
        if (value.parent?.subscription_details?.subscription !== undefined)
          subscriptionId = reference(value.parent.subscription_details.subscription)
      } else return null
      if (subscriptionId === null) return null
      const value = await subscription(subscriptionId)
      const authority = value.metadata[BILLING_POLICY.authorityMetadataKey]
      const requestId = value.metadata[BILLING_POLICY.checkoutMetadataKey]
      if (authority === undefined || requestId === undefined) return null
      return {
        id: authority,
        requestId,
        customerId: reference(value.customer),
        subscriptionId,
        checkoutSessionId: null,
      }
    },
    async snapshot(authority, subscriptionId) {
      const value = await subscription(subscriptionId)
      if (
        reference(value.customer) !== authority.customerId ||
        value.metadata[BILLING_POLICY.authorityMetadataKey] !== authority.id ||
        value.metadata[BILLING_POLICY.checkoutMetadataKey] !== authority.requestId
      )
        throw apiErrors.forbidden()
      const item = value.items.data[0]
      const denied: BillingSnapshot = {
        subscriptionId,
        subscriptionStatus: value.status,
        paidThrough: null,
        suspended: true,
        cancelAtPeriodEnd: value.cancel_at_period_end,
        invoiceId: null,
      }
      if (
        item.price.id !== priceId(config, authority.plan) ||
        item.current_period_start > Date.now() / BILLING_POLICY.millisecondsPerSecond ||
        item.current_period_end <= item.current_period_start ||
        item.current_period_end - item.current_period_start >
          BILLING_POLICY.maximumPaidPeriodSeconds ||
        value.status !== 'active' ||
        value.pause_collection !== null ||
        value.latest_invoice === null
      )
        return denied
      const paidInvoice = await invoice(reference(value.latest_invoice))
      const line = paidInvoice.lines.data[0]
      const parent = paidInvoice.parent?.subscription_details
      if (
        parent?.subscription === undefined ||
        reference(paidInvoice.customer) !== authority.customerId ||
        reference(parent.subscription) !== subscriptionId ||
        paidInvoice.status !== 'paid' ||
        paidInvoice.currency !== 'usd' ||
        paidInvoice.amount_due !==
          PUBLIC_PLANS[authority.plan].monthlyUsd * BILLING_POLICY.centsPerDollar ||
        paidInvoice.amount_paid < paidInvoice.amount_due ||
        line.pricing?.price_details?.price === undefined ||
        reference(line.pricing.price_details.price) !== item.price.id ||
        line.period.start !== item.current_period_start ||
        line.period.end !== item.current_period_end
      )
        return denied
      const payments = paymentsSchema.parse(
        await stripe.invoicePayments.list({ invoice: paidInvoice.id, status: 'paid', limit: 2 }),
      )
      const payment = payments.data[0]
      if (
        payments.data.length !== 1 ||
        payment?.payment.type !== 'payment_intent' ||
        payment.payment.payment_intent === undefined ||
        payment.amount_paid !== paidInvoice.amount_paid ||
        reference(payment.invoice) !== paidInvoice.id ||
        payment.livemode !== config.liveMode
      )
        return denied
      const intent = await stripe.paymentIntents.retrieve(reference(payment.payment.payment_intent))
      assertMode(intent.livemode, config)
      if (
        intent.status !== 'succeeded' ||
        intent.latest_charge === null ||
        intent.currency !== 'usd' ||
        intent.amount_received < paidInvoice.amount_due ||
        reference(referenceSchema.parse(intent.customer)) !== authority.customerId
      )
        return denied
      const chargeId = reference(referenceSchema.parse(intent.latest_charge))
      const charge = chargeSchema.parse(await stripe.charges.retrieve(chargeId))
      assertMode(charge.livemode, config)
      if (
        !charge.paid ||
        charge.refunded ||
        charge.amount_refunded > 0 ||
        charge.currency !== 'usd' ||
        charge.amount < paidInvoice.amount_due ||
        charge.customer === null ||
        reference(charge.customer) !== authority.customerId
      )
        return denied
      if (charge.disputed) {
        const disputes = await stripe.disputes.list({ charge: charge.id, limit: 2 })
        if (disputes.has_more || disputes.data.length !== 1 || disputes.data[0]?.status !== 'won')
          return denied
      }
      return {
        ...denied,
        invoiceId: paidInvoice.id,
        suspended: false,
        paidThrough: new Date(item.current_period_end * BILLING_POLICY.millisecondsPerSecond),
      }
    },
    async inspect(authority) {
      const empty: BillingProviderState = {
        checkoutSessionId: null,
        checkoutState: 'none',
        checkoutUrl: null,
        chargeable: false,
        snapshot: null,
      }
      if (authority.customerId === null) return empty
      let session: Stripe.Checkout.Session | null
      if (authority.checkoutSessionId === null) {
        const sessions = await stripe.checkout.sessions.list({
          customer: authority.customerId,
          limit: 100,
        })
        const matching = sessions.data.filter(
          (item) =>
            item.metadata?.[BILLING_POLICY.authorityMetadataKey] === authority.id &&
            item.metadata[BILLING_POLICY.checkoutMetadataKey] === authority.requestId,
        )
        if (matching.length > 1 || (matching.length === 0 && sessions.has_more))
          throw apiErrors.retryLater()
        session = matching[0] ?? null
      } else session = await stripe.checkout.sessions.retrieve(authority.checkoutSessionId)
      if (session === null) return empty
      assertMode(session.livemode, config)
      if (
        session.mode !== 'subscription' ||
        (authority.checkoutSessionId !== null && session.id !== authority.checkoutSessionId) ||
        session.customer === null ||
        reference(referenceSchema.parse(session.customer)) !== authority.customerId ||
        session.metadata?.[BILLING_POLICY.authorityMetadataKey] !== authority.id ||
        session.metadata[BILLING_POLICY.checkoutMetadataKey] !== authority.requestId
      )
        throw apiErrors.forbidden()
      const checkoutState = z.enum(['open', 'complete', 'expired']).parse(session.status)
      const state: BillingProviderState = {
        ...empty,
        checkoutSessionId: session.id,
        checkoutState,
        checkoutUrl:
          checkoutState === 'open' ? hostedUrl(session.url, 'checkout.stripe.com') : null,
        chargeable: checkoutState === 'open',
      }
      if (session.subscription !== null) {
        const id = reference(referenceSchema.parse(session.subscription))
        if (authority.subscriptionId !== null && authority.subscriptionId !== id)
          throw apiErrors.forbidden()
        state.snapshot = await gateway.snapshot(authority, id)
        state.chargeable = !['canceled', 'incomplete_expired'].includes(
          state.snapshot.subscriptionStatus,
        )
      } else if (checkoutState === 'complete') throw apiErrors.retryLater()
      return state
    },
    async closeCheckout(authority) {
      const current = await gateway.inspect(authority)
      if (current.checkoutState === 'open' && current.checkoutSessionId !== null) {
        await stripe.checkout.sessions.expire(current.checkoutSessionId)
        return await gateway.inspect({ ...authority, checkoutSessionId: current.checkoutSessionId })
      }
      if (current.chargeable) throw apiErrors.conflict()
      return current
    },
    async closeAccount(authority) {
      let current = await gateway.inspect(authority)
      if (current.checkoutState === 'open') current = await gateway.closeCheckout(authority)
      if (current.chargeable && current.snapshot !== null) {
        await stripe.subscriptions.cancel(current.snapshot.subscriptionId, {
          invoice_now: false,
          prorate: false,
        })
        current = await gateway.inspect({
          ...authority,
          checkoutSessionId: current.checkoutSessionId,
        })
      }
      if (current.chargeable) throw apiErrors.retryLater()
      return {
        ...current,
        snapshot:
          current.snapshot === null
            ? null
            : { ...current.snapshot, paidThrough: null, suspended: true },
      }
    },
  }
  return gateway
}
