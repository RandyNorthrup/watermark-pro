import { describe, expect, it } from 'vitest'

import { stripeConfigurationSchema } from './billing'
import {
  billingCheckoutRequestSchema,
  billingRedirectSchema,
  billingScopeRequestSchema,
} from './billing-client'

const CONFIG = {
  accountId: 'acct_Fixture',
  liveMode: false,
  secretKey: 'sk_test_Fixture',
  webhookSecret: 'whsec_Fixture',
  proPriceId: 'price_Pro',
  teamPriceId: 'price_Team',
  portalConfigurationId: 'bpc_Fixture',
}
const REQUEST_ID = 'f252aef3-e529-48a7-adfc-6b30e54d15b0'

describe('shared billing trust boundaries', () => {
  it('requires complete account-pinned matching mode and distinct catalog identifiers', () => {
    expect(stripeConfigurationSchema.safeParse(CONFIG).success).toBe(true)
    expect(stripeConfigurationSchema.safeParse({ ...CONFIG, liveMode: true }).success).toBe(false)
    expect(
      stripeConfigurationSchema.safeParse({ ...CONFIG, teamPriceId: CONFIG.proPriceId }).success,
    ).toBe(false)
    expect(
      stripeConfigurationSchema.safeParse({ ...CONFIG, webhookSecret: undefined }).success,
    ).toBe(false)
  })
  it('accepts own product intent and refuses caller provider identity, missing names, mixed intents and annual terms', () => {
    expect(
      billingCheckoutRequestSchema.safeParse({ requestId: REQUEST_ID, plan: 'pro' }).success,
    ).toBe(true)
    expect(
      billingCheckoutRequestSchema.safeParse({
        requestId: REQUEST_ID,
        plan: 'team',
        newWorkspaceName: 'My Team',
      }).success,
    ).toBe(true)
    for (const body of [
      { requestId: REQUEST_ID, plan: 'team' },
      { requestId: REQUEST_ID, plan: 'pro', priceId: 'price_Foreign' },
      {
        requestId: REQUEST_ID,
        plan: 'team',
        newWorkspaceName: 'My Team',
        organizationId: 'foreign',
      },
      { requestId: REQUEST_ID, plan: 'pro', annual: true },
    ])
      expect(billingCheckoutRequestSchema.safeParse(body).success).toBe(false)
    expect(billingScopeRequestSchema.safeParse({ plan: 'team' }).success).toBe(true)
    expect(
      billingScopeRequestSchema.safeParse({ plan: 'team', subscriptionId: 'sub_Foreign' }).success,
    ).toBe(false)
  })
  it('accepts only Stripe HTTPS hosted redirects, rejecting credentials, port changes and other origins', () => {
    expect(
      billingRedirectSchema.safeParse({ url: 'https://checkout.stripe.com/c/pay/Fixture' }).success,
    ).toBe(true)
    expect(
      billingRedirectSchema.safeParse({ url: 'https://billing.stripe.com/p/session/Fixture' })
        .success,
    ).toBe(true)
    const plaintext = new URL('https://checkout.stripe.com/c/pay/Fixture')
    plaintext.protocol = 'http:'
    for (const url of [
      plaintext.href,
      'https://checkout.stripe.com:8443/c/pay/Fixture',
      'https://user:password@checkout.stripe.com/c/pay/Fixture',
      'https://evil.test/',
    ])
      expect(billingRedirectSchema.safeParse({ url }).success).toBe(false)
  })
})
