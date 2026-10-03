import { afterEach, describe, expect, it, vi } from 'vitest'

import { createStripeGateway } from './stripe-gateway'
import { BILLING_POLICY } from '../shared/billing'
import {
  stripeFixtureUrl,
  installStripeFixture,
  signStripeBody,
  STRIPE_FIXTURE_CONFIG,
  stripeAuthority,
  stripeEvent,
} from './test-support/stripe-fixture'

afterEach(() => vi.unstubAllGlobals())

describe('account-pinned official Stripe SDK gateway', () => {
  it('verifies owning account and API mode before any payment mutation', async () => {
    const fixture = installStripeFixture()
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    await expect(gateway.assertAccount('checkout')).resolves.toBe(true)
    fixture.change('/v1/account', { id: 'acct_UnrelatedBusiness' })
    await expect(gateway.assertAccount('checkout')).rejects.toMatchObject({ status: 503 })
    fixture.change('/v1/account', { id: STRIPE_FIXTURE_CONFIG.accountId })
    fixture.change('/v1/balance', { livemode: true })
    await expect(gateway.assertAccount('checkout')).rejects.toMatchObject({ status: 503 })
  })
  it.each(['charges_enabled', 'payouts_enabled'])('requires live %s', async (field) => {
    const fixture = installStripeFixture()
    fixture.change('/v1/balance', { livemode: true })
    fixture.change('/v1/account', { [field]: false })
    await expect(
      createStripeGateway({ ...STRIPE_FIXTURE_CONFIG, liveMode: true }).assertAccount('checkout'),
    ).rejects.toMatchObject({ status: 503 })
  })
  it('creates minimal customer metadata, stable idempotency and server-owned Checkout parameters', async () => {
    const authority = stripeAuthority()
    const fixture = installStripeFixture(authority)
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    await expect(gateway.createCustomer(authority)).resolves.toBe('cus_Fixture')
    await expect(gateway.createCheckout(authority, 'https://lumafoil.com')).resolves.toEqual({
      id: 'cs_test_Fixture',
      url: 'https://checkout.stripe.com/c/pay/cs_test_Fixture',
    })
    const call = fixture.fetch.mock.calls.find(([input]) =>
      stripeFixtureUrl(input).endsWith('/checkout/sessions'),
    )
    const init = call?.[1]
    expect(new Headers(init?.headers).get('idempotency-key')).toBe(
      `lumafoil-checkout-${authority.requestId}`,
    )
    expect(new Headers(init?.headers).get('stripe-version')).toBe(BILLING_POLICY.apiVersion)
    const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
    expect(form.get('line_items[0][price]')).toBe(STRIPE_FIXTURE_CONFIG.proPriceId)
    expect(form.get('customer')).toBe(authority.customerId)
    expect(form.get('subscription_data[metadata][lumafoil_checkout]')).toBe(authority.requestId)
    expect(form.get('success_url')).toBe(
      'https://lumafoil.com/app/account?billing=returned&billingPlan=pro',
    )
    expect(form.has('customer_email')).toBe(false)
  })
  it.each([
    { active: false },
    { currency: 'eur' },
    { unit_amount: 901 },
    { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } },
    { recurring: { interval: 'month', interval_count: 2, usage_type: 'licensed' } },
    { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } },
    { billing_scheme: 'tiered' },
    { transform_quantity: { divide_by: 3 } },
    { tax_behavior: 'inclusive' },
  ])('refuses altered monthly USD catalog: %j', async (patch) => {
    const fixture = installStripeFixture()
    fixture.change('/v1/prices/price_ProFixture', patch)
    await expect(
      createStripeGateway(STRIPE_FIXTURE_CONFIG).createCheckout(
        stripeAuthority(),
        'https://lumafoil.com',
      ),
    ).rejects.toMatchObject({ status: 503 })
    expect(
      fixture.fetch.mock.calls.some(([input]) =>
        stripeFixtureUrl(input).endsWith('/checkout/sessions'),
      ),
    ).toBe(false)
  })
  const insecureCheckout = new URL('https://checkout.stripe.com/c/pay/x')
  insecureCheckout.protocol = 'http:'
  it.each([
    null,
    insecureCheckout.href,
    'https://evil.test/c/pay/x',
    'https://user:pass@checkout.stripe.com/c/pay/x',
  ])('rejects unsafe hosted checkout URL %s', async (url) => {
    const fixture = installStripeFixture()
    fixture.change('/v1/checkout/sessions', { url })
    await expect(
      createStripeGateway(STRIPE_FIXTURE_CONFIG).createCheckout(
        stripeAuthority(),
        'https://lumafoil.com',
      ),
    ).rejects.toMatchObject({ status: 503 })
  })
  it('creates cancellation-only portal for the persisted workspace customer', async () => {
    const fixture = installStripeFixture()
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    await expect(gateway.createPortal(stripeAuthority(), 'https://lumafoil.com')).resolves.toBe(
      'https://billing.stripe.com/p/session/Fixture',
    )
    fixture.change(
      `/v1/billing_portal/configurations/${STRIPE_FIXTURE_CONFIG.portalConfigurationId}`,
      {
        features: {
          subscription_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: 'at_period_end' },
        },
      },
    )
    await expect(
      gateway.createPortal(stripeAuthority(), 'https://lumafoil.com'),
    ).rejects.toMatchObject({ status: 503 })
  })
  it('verifies raw bytes, rejects invalid/replayed/future signatures, connected events and wrong mode', async () => {
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    const event = stripeEvent()
    const body = JSON.stringify(event)
    const signature = await signStripeBody(body)
    await expect(gateway.verifyEvent(body, signature)).resolves.toEqual(event)
    await expect(gateway.verifyEvent(`${body} `, signature)).rejects.toMatchObject({ status: 400 })
    for (const offset of [-301, 301]) {
      const expired = await signStripeBody(body, Math.floor(Date.now() / 1000) + offset)
      await expect(gateway.verifyEvent(body, expired)).rejects.toMatchObject({ status: 400 })
    }
    await expect(gateway.verifyEvent(body, 'garbage')).rejects.toMatchObject({ status: 400 })
    for (const patch of [
      { livemode: true },
      { account: 'acct_Unrelated' },
      { context: 'acct_Unrelated' },
    ]) {
      const foreign = JSON.stringify({ ...event, ...patch })
      await expect(
        gateway.verifyEvent(foreign, await signStripeBody(foreign)),
      ).rejects.toMatchObject({ status: 403 })
    }
    const malformed = JSON.stringify({ ...event, id: 'bad' })
    await expect(
      gateway.verifyEvent(malformed, await signStripeBody(malformed)),
    ).rejects.toMatchObject({ status: 400 })
  })
  it.each([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'customer.subscription.updated',
    'invoice.paid',
    'invoice.payment_failed',
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.closed',
  ])('resolves %s from current provider objects', async (type) => {
    const authority = stripeAuthority()
    installStripeFixture(authority)
    await expect(
      createStripeGateway(STRIPE_FIXTURE_CONFIG).eventAuthority(stripeEvent(type)),
    ).resolves.toMatchObject({
      id: authority.id,
      requestId: authority.requestId,
      subscriptionId: 'sub_Fixture',
      customerId: 'cus_Fixture',
      checkoutSessionId: type.startsWith('checkout.') ? 'cs_test_Fixture' : null,
    })
  })
  it('ignores unrelated provider objects and non-subscription Checkout', async () => {
    const fixture = installStripeFixture()
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    await expect(gateway.eventAuthority(stripeEvent('customer.created'))).resolves.toBeNull()
    fixture.change('/v1/checkout/sessions/cs_test_Fixture', { mode: 'payment' })
    await expect(
      gateway.eventAuthority(stripeEvent('checkout.session.completed')),
    ).resolves.toBeNull()
    fixture.change('/v1/invoices/in_Fixture', { parent: null })
    await expect(gateway.eventAuthority(stripeEvent())).resolves.toBeNull()
    fixture.change('/v1/subscriptions/sub_Fixture', { metadata: {} })
    await expect(
      gateway.eventAuthority(stripeEvent('customer.subscription.updated')),
    ).resolves.toBeNull()
  })
  it.each(['pro', 'team'] as const)(
    'grants %s only from actual current paid invoice and succeeded charge',
    async (plan) => {
      const authority = stripeAuthority({ plan })
      const fixture = installStripeFixture(authority)
      await expect(
        createStripeGateway(STRIPE_FIXTURE_CONFIG).snapshot(authority, 'sub_Fixture'),
      ).resolves.toEqual({
        subscriptionId: 'sub_Fixture',
        subscriptionStatus: 'active',
        suspended: false,
        paidThrough: new Date(fixture.end * 1000),
        cancelAtPeriodEnd: false,
        invoiceId: 'in_Fixture',
      })
      fixture.change('/v1/subscriptions/sub_Fixture', { cancel_at_period_end: true })
      await expect(
        createStripeGateway(STRIPE_FIXTURE_CONFIG).snapshot(authority, 'sub_Fixture'),
      ).resolves.toMatchObject({ suspended: false, cancelAtPeriodEnd: true })
    },
  )
  it.each([
    'incomplete',
    'incomplete_expired',
    'trialing',
    'past_due',
    'unpaid',
    'canceled',
    'paused',
  ])('suspends %s rather than accepting redirect or subscription status alone', async (status) => {
    const fixture = installStripeFixture()
    fixture.change('/v1/subscriptions/sub_Fixture', { status })
    await expect(
      createStripeGateway(STRIPE_FIXTURE_CONFIG).snapshot(stripeAuthority(), 'sub_Fixture'),
    ).resolves.toMatchObject({ suspended: true, paidThrough: null })
  })
  it.each([
    ['/v1/subscriptions/sub_Fixture', { pause_collection: {} }],
    ['/v1/subscriptions/sub_Fixture', { latest_invoice: null }],
    ['/v1/invoices/in_Fixture', { status: 'open' }],
    ['/v1/invoices/in_Fixture', { amount_due: 0, amount_paid: 0 }],
    ['/v1/invoices/in_Fixture', { amount_paid: 0 }],
    ['/v1/invoices/in_Fixture', { currency: 'eur' }],
    ['/v1/invoices/in_Fixture', { customer: 'cus_Foreign' }],
    [
      '/v1/invoices/in_Fixture',
      { parent: { subscription_details: { subscription: 'sub_Foreign' } } },
    ],
    ['/v1/invoices/in_Fixture', { parent: null }],
    ['/v1/invoice_payments', { data: [] }],
    [
      '/v1/invoice_payments',
      {
        data: [
          {
            invoice: 'in_Fixture',
            livemode: false,
            amount_paid: 900,
            status: 'paid',
            payment: { type: 'payment_record' },
          },
        ],
      },
    ],
    ['/v1/payment_intents/pi_Fixture', { status: 'requires_action' }],
    ['/v1/payment_intents/pi_Fixture', { latest_charge: null }],
    ['/v1/payment_intents/pi_Fixture', { amount_received: 0 }],
    ['/v1/charges/ch_Fixture', { paid: false }],
    ['/v1/charges/ch_Fixture', { refunded: true }],
    ['/v1/charges/ch_Fixture', { amount_refunded: 1 }],
    ['/v1/charges/ch_Fixture', { customer: null }],
    ['/v1/charges/ch_Fixture', { customer: 'cus_Foreign' }],
  ] as const)(
    'refuses unpaid/out-of-band/refunded or mismatched payment at %s: %j',
    async (path, patch) => {
      const fixture = installStripeFixture()
      fixture.change(path, patch)
      await expect(
        createStripeGateway(STRIPE_FIXTURE_CONFIG).snapshot(stripeAuthority(), 'sub_Fixture'),
      ).resolves.toMatchObject({ suspended: true, paidThrough: null })
    },
  )
  it('suspends unresolved/lost disputes, restores only provider-confirmed win', async () => {
    const fixture = installStripeFixture()
    fixture.change('/v1/charges/ch_Fixture', { disputed: true })
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    await expect(gateway.snapshot(stripeAuthority(), 'sub_Fixture')).resolves.toMatchObject({
      suspended: false,
    })
    for (const status of ['needs_response', 'under_review', 'lost']) {
      fixture.change('/v1/disputes', { data: [{ status }] })
      await expect(gateway.snapshot(stripeAuthority(), 'sub_Fixture')).resolves.toMatchObject({
        suspended: true,
      })
    }
  })
  it('refuses crossed tenant, checkout generation, subscription mode or catalog', async () => {
    const fixture = installStripeFixture()
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    for (const patch of [
      { customer: 'cus_Foreign' },
      { metadata: { lumafoil_authority: 'foreign' } },
      { livemode: true },
    ]) {
      fixture.change('/v1/subscriptions/sub_Fixture', patch)
      await expect(gateway.snapshot(stripeAuthority(), 'sub_Fixture')).rejects.toMatchObject({
        status: 403,
      })
    }
  })
  it('recovers an unbound Checkout only from exact server metadata and refuses ambiguous or incomplete provider search', async () => {
    const authority = stripeAuthority({ checkoutSessionId: null })
    const fixture = installStripeFixture(authority)
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    await expect(gateway.inspect(authority)).resolves.toMatchObject({
      checkoutState: 'none',
      chargeable: false,
    })
    const session = fixture.values.get('/v1/checkout/sessions/cs_test_Fixture')
    if (session === undefined) throw new Error('Missing named Checkout fixture.')
    fixture.change('/v1/checkout/sessions/list', { data: [session] })
    await expect(gateway.inspect(authority)).resolves.toMatchObject({
      checkoutState: 'complete',
      chargeable: true,
    })
    fixture.change('/v1/checkout/sessions/list', { data: [session, session] })
    await expect(gateway.inspect(authority)).rejects.toMatchObject({ status: 503 })
    fixture.change('/v1/checkout/sessions/list', { data: [], has_more: true })
    await expect(gateway.inspect(authority)).rejects.toMatchObject({ status: 503 })
  })
  it('refuses crossed returned session identity, customer and request metadata even on a bound SDK retrieval', async () => {
    const authority = stripeAuthority()
    const fixture = installStripeFixture(authority)
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    for (const patch of [
      { id: 'cs_Foreign' },
      { customer: 'cus_Foreign' },
      { metadata: { lumafoil_authority: 'foreign' } },
    ]) {
      const original = fixture.values.get('/v1/checkout/sessions/cs_test_Fixture')
      fixture.change('/v1/checkout/sessions/cs_test_Fixture', patch)
      await expect(gateway.inspect(authority)).rejects.toMatchObject({ status: 403 })
      if (original === undefined) throw new Error('Missing named Checkout fixture.')
      fixture.values.set('/v1/checkout/sessions/cs_test_Fixture', original)
    }
  })
  it('closes only an actually open session and refuses pretending that a paid subscription is closed', async () => {
    const authority = stripeAuthority()
    const fixture = installStripeFixture(authority)
    const gateway = createStripeGateway(STRIPE_FIXTURE_CONFIG)
    await expect(gateway.closeCheckout(authority)).rejects.toMatchObject({ status: 409 })
    fixture.change('/v1/checkout/sessions/cs_test_Fixture', { status: 'open', subscription: null })
    await expect(gateway.closeCheckout(authority)).resolves.toMatchObject({
      checkoutState: 'expired',
      chargeable: false,
    })
    await expect(gateway.closeCheckout(authority)).resolves.toMatchObject({
      checkoutState: 'expired',
      chargeable: false,
    })
  })
})
