import { describe, expect, it } from 'vitest'

import {
  billingCheckoutRequestSchema,
  billingRedirectSchema,
  billingScopeRequestSchema,
} from './billing-client'

const intent = { requestId: '77fc4f51-b095-4fa1-bfe3-41d168940317', plan: 'pro' } as const

describe('public billing intent and redirect boundaries', () => {
  it('accepts fixed plans and explicit new shared workspace intent', () => {
    expect(billingCheckoutRequestSchema.safeParse(intent).success).toBe(true)
    expect(
      billingCheckoutRequestSchema.safeParse({
        ...intent,
        plan: 'team',
        newWorkspaceName: 'Shared gallery',
      }).success,
    ).toBe(true)
    expect(
      billingCheckoutRequestSchema.safeParse({
        ...intent,
        plan: 'team',
        organizationId: 'existing-shared',
      }).success,
    ).toBe(true)
    expect(billingScopeRequestSchema.safeParse({ plan: 'pro' }).success).toBe(true)
  })
  it.each([
    { ...intent, customerId: 'cus_client' },
    { ...intent, priceId: 'price_client' },
    { ...intent, requestId: 'not-a-uuid' },
    { ...intent, plan: 'team', newWorkspaceName: '' },
    { ...intent, plan: 'team' },
  ])('rejects forged or missing checkout authority %j', (input) => {
    expect(billingCheckoutRequestSchema.safeParse(input).success).toBe(false)
  })
  it.each([
    'https://checkout.stripe.com/c/pay/fixture',
    'https://billing.stripe.com/p/session/fixture',
  ])('accepts official hosted target %s', (url) => {
    expect(billingRedirectSchema.safeParse({ url }).success).toBe(true)
  })
  it.each([
    ['http:', '//checkout.stripe.com/fixture'].join(''),
    'https://checkout.stripe.com.evil.example/fixture',
    'https://user:password@billing.stripe.com/fixture',
    'https://billing.stripe.com:444/fixture',
    'javascript:alert(1)',
  ])('refuses unsafe target %s', (url) => {
    expect(billingRedirectSchema.safeParse({ url }).success).toBe(false)
  })
})
