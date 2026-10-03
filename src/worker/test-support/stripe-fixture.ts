import { vi } from 'vitest'

import { BILLING_POLICY, type BillingAuthority, type BillingEvent } from '../../shared/billing'

/** Named disposable provider fixture: no account access, external keys or runtime fallback. */
export const STRIPE_FIXTURE_CONFIG = {
  accountId: 'acct_LumafoilFixture',
  liveMode: false,
  secretKey: 'sk_test_fixture',
  webhookSecret: 'whsec_LumafoilFixture',
  proPriceId: 'price_ProFixture',
  teamPriceId: 'price_TeamFixture',
  portalConfigurationId: 'bpc_LumafoilFixture',
}
export function stripeAuthority(overrides: Partial<BillingAuthority> = {}): BillingAuthority {
  return {
    id: 'workspace-fixture',
    organizationId: 'workspace-fixture',
    ownerId: 'owner-fixture',
    accountId: STRIPE_FIXTURE_CONFIG.accountId,
    liveMode: false,
    plan: 'pro',
    requestId: 'f252aef3-e529-48a7-adfc-6b30e54d15b0',
    newWorkspaceName: null,
    customerId: 'cus_Fixture',
    checkoutSessionId: 'cs_test_Fixture',
    checkoutExpiresAt: new Date(Date.now() + 3_600_000),
    checkoutState: 'open',
    chargeable: true,
    subscriptionId: null,
    subscriptionStatus: 'none',
    paidThrough: null,
    suspended: true,
    cancelAtPeriodEnd: false,
    invoiceId: null,
    revision: 0,
    ...overrides,
  }
}
export function stripeEvent(type = 'invoice.paid', id = 'evt_Fixture'): BillingEvent {
  let objectId = type.startsWith('customer.subscription.') ? 'sub_Fixture' : 'in_Fixture'
  if (type.startsWith('checkout.')) objectId = 'cs_test_Fixture'
  if (type.startsWith('charge.dispute.')) objectId = 'dp_Fixture'
  if (type === 'charge.refunded') objectId = 'ch_Fixture'
  return {
    id,
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: { id: objectId } },
  }
}
/** Reads a promised fixture value without obscuring the assertion's actual field. */
export async function billingValue<T, U>(
  promise: T | Promise<T>,
  read: (value: Awaited<T>) => U,
): Promise<U> {
  const value = await promise
  return read(value)
}
/** Normalize SDK fixture inputs without treating Request as an arbitrary object string. */
export function stripeFixtureUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString()
}

export async function signStripeBody(
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(STRIPE_FIXTURE_CONFIG.webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const hash = await crypto.subtle.sign('HMAC', key, encoder.encode(`${String(timestamp)}.${body}`))
  const hex = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `t=${String(timestamp)},v1=${hex}`
}
export function installStripeFixture(authority = stripeAuthority(), prefix = '') {
  const amount = authority.plan === 'pro' ? 900 : 2400
  const price =
    authority.plan === 'pro' ? STRIPE_FIXTURE_CONFIG.proPriceId : STRIPE_FIXTURE_CONFIG.teamPriceId
  const start = Math.floor(Date.now() / 1000) - 60
  const end = start + 30 * 86_400
  const values = new Map<string, Record<string, unknown>>([
    [
      '/v1/account',
      { id: STRIPE_FIXTURE_CONFIG.accountId, charges_enabled: true, payouts_enabled: true },
    ],
    ['/v1/balance', { livemode: false }],
    ['/v1/checkout/sessions/list', { has_more: false, data: [] }],
    [
      `/v1/prices/${price}`,
      {
        id: price,
        livemode: false,
        active: true,
        currency: 'usd',
        unit_amount: amount,
        recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
        billing_scheme: 'per_unit',
        transform_quantity: null,
        tax_behavior: 'exclusive',
      },
    ],
    ['/v1/customers', { id: `cus_${prefix}Fixture`, livemode: false }],
    [
      '/v1/checkout/sessions',
      {
        id: `cs_test_${prefix}Fixture`,
        livemode: false,
        customer: `cus_${prefix}Fixture`,
        url: `https://checkout.stripe.com/c/pay/cs_test_${prefix}Fixture`,
      },
    ],
    [
      `/v1/checkout/sessions/cs_test_${prefix}Fixture`,
      {
        id: `cs_test_${prefix}Fixture`,
        livemode: false,
        customer: `cus_${prefix}Fixture`,
        mode: 'subscription',
        status: 'complete',
        subscription: `sub_${prefix}Fixture`,
        url: `https://checkout.stripe.com/c/pay/cs_test_${prefix}Fixture`,
        metadata: { lumafoil_authority: authority.id, lumafoil_checkout: authority.requestId },
      },
    ],
    [
      `/v1/billing_portal/configurations/${STRIPE_FIXTURE_CONFIG.portalConfigurationId}`,
      {
        id: STRIPE_FIXTURE_CONFIG.portalConfigurationId,
        active: true,
        livemode: false,
        features: {
          subscription_update: { enabled: false },
          subscription_cancel: { enabled: true, mode: 'at_period_end' },
        },
      },
    ],
    ['/v1/billing_portal/sessions', { url: 'https://billing.stripe.com/p/session/Fixture' }],
    [
      `/v1/subscriptions/sub_${prefix}Fixture`,
      {
        id: `sub_${prefix}Fixture`,
        livemode: false,
        customer: `cus_${prefix}Fixture`,
        status: 'active',
        cancel_at_period_end: false,
        pause_collection: null,
        latest_invoice: `in_${prefix}Fixture`,
        metadata: {
          [BILLING_POLICY.authorityMetadataKey]: authority.id,
          [BILLING_POLICY.checkoutMetadataKey]: authority.requestId,
        },
        items: {
          has_more: false,
          data: [
            {
              quantity: 1,
              current_period_start: start,
              current_period_end: end,
              price: { id: price },
            },
          ],
        },
      },
    ],
    [
      `/v1/invoices/in_${prefix}Fixture`,
      {
        id: `in_${prefix}Fixture`,
        livemode: false,
        customer: `cus_${prefix}Fixture`,
        status: 'paid',
        currency: 'usd',
        amount_due: amount,
        amount_paid: amount,
        parent: { subscription_details: { subscription: `sub_${prefix}Fixture` } },
        lines: {
          has_more: false,
          data: [{ amount, period: { start, end }, pricing: { price_details: { price } } }],
        },
      },
    ],
    [
      '/v1/invoice_payments',
      {
        has_more: false,
        data: [
          {
            invoice: `in_${prefix}Fixture`,
            livemode: false,
            amount_paid: amount,
            status: 'paid',
            payment: { type: 'payment_intent', payment_intent: `pi_${prefix}Fixture` },
          },
        ],
      },
    ],
    [
      `/v1/payment_intents/pi_${prefix}Fixture`,
      {
        id: `pi_${prefix}Fixture`,
        livemode: false,
        customer: `cus_${prefix}Fixture`,
        status: 'succeeded',
        latest_charge: `ch_${prefix}Fixture`,
        currency: 'usd',
        amount_received: amount,
      },
    ],
    [
      `/v1/charges/ch_${prefix}Fixture`,
      {
        id: `ch_${prefix}Fixture`,
        livemode: false,
        customer: `cus_${prefix}Fixture`,
        payment_intent: `pi_${prefix}Fixture`,
        paid: true,
        refunded: false,
        amount_refunded: 0,
        disputed: false,
        currency: 'usd',
        amount,
      },
    ],
    [
      `/v1/disputes/dp_${prefix}Fixture`,
      {
        id: `dp_${prefix}Fixture`,
        livemode: false,
        charge: `ch_${prefix}Fixture`,
        status: 'needs_response',
      },
    ],
    [
      '/v1/disputes',
      { has_more: false, data: [{ id: `dp_${prefix}Fixture`, livemode: false, status: 'won' }] },
    ],
  ])
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname === `/v1/checkout/sessions/cs_test_${prefix}Fixture/expire`) {
      const current = values.get(`/v1/checkout/sessions/cs_test_${prefix}Fixture`)
      if (current === undefined) throw new Error('No fixture Checkout.')
      values.set(`/v1/checkout/sessions/cs_test_${prefix}Fixture`, {
        ...current,
        status: 'expired',
        subscription: null,
        url: null,
      })
      return Promise.resolve(
        Response.json(values.get(`/v1/checkout/sessions/cs_test_${prefix}Fixture`)),
      )
    }
    const method = init?.method ?? 'GET'
    if (method === 'DELETE' && url.pathname === `/v1/subscriptions/sub_${prefix}Fixture`) {
      const subscription = values.get(url.pathname)
      values.set(url.pathname, { ...subscription, status: 'canceled', cancel_at_period_end: false })
    }
    const value =
      method === 'GET' && url.pathname === '/v1/checkout/sessions'
        ? values.get('/v1/checkout/sessions/list')
        : values.get(url.pathname)
    if (method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const current = values.get(`/v1/checkout/sessions/cs_test_${prefix}Fixture`)
      const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
      const id = typeof value?.['id'] === 'string' ? value['id'] : `cs_test_${prefix}Fixture`
      values.set(`/v1/checkout/sessions/${id}`, {
        ...current,
        id,
        status: 'open',
        subscription: null,
        url: value?.['url'],
        metadata: {
          lumafoil_authority: form.get('metadata[lumafoil_authority]'),
          lumafoil_checkout: form.get('metadata[lumafoil_checkout]'),
        },
      })
      values.set('/v1/checkout/sessions/list', {
        has_more: false,
        data: [values.get(`/v1/checkout/sessions/${id}`)],
      })
    }
    if (value === undefined || url.origin !== 'https://api.stripe.com')
      throw new Error(`Unexpected Stripe fixture request: ${url.pathname}`)
    const headers = new Headers(init?.headers)
    if (headers.get('stripe-version') !== BILLING_POLICY.apiVersion)
      throw new Error('Unexpected Stripe API version.')
    return Promise.resolve(
      Response.json(value, { headers: { 'request-id': 'req_DisposableFixture' } }),
    )
  })
  vi.stubGlobal('fetch', fetch)
  return {
    values,
    fetch,
    end,
    start,
    price,
    amount,
    completeCheckout() {
      const current = values.get(`/v1/checkout/sessions/cs_test_${prefix}Fixture`)
      values.set(`/v1/checkout/sessions/cs_test_${prefix}Fixture`, {
        ...current,
        status: 'complete',
        subscription: `sub_${prefix}Fixture`,
      })
    },
    change(path: string, patch: Record<string, unknown>) {
      const saved = values.get(path)
      if (saved === undefined) throw new Error('Missing Stripe fixture resource.')
      values.set(path, { ...saved, ...patch })
    },
  }
}
