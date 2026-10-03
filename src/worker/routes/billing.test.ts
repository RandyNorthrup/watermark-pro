import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { BILLING_POLICY, type BillingAuthority } from '../../shared/billing'
import { billingOverviewSchema } from '../../shared/billing-client'
import { RECENT_AUTHENTICATION_WINDOW_MS } from '../../shared/constants'
import type { BillingStore } from '../billing-store'
import { createStripeGateway } from '../stripe-gateway'
import { joinAsMember, signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import {
  installStripeFixture,
  STRIPE_FIXTURE_CONFIG,
  signStripeBody,
  stripeEvent,
  stripeAuthority,
} from '../test-support/stripe-fixture'
import { createTestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Billing Owner',
  email: 'billing-owner@example.test',
  password: 'a billing owner fixture passphrase',
}
const OTHER = {
  name: 'Billing Member',
  email: 'billing-member@example.test',
  password: 'a billing member fixture passphrase',
}
const CHECKOUT = '/api/me/billing/checkout'
const scope = { plan: 'team' }
const sessionSchema = z.object({
  user: z.object({ id: z.string() }),
  session: z.object({ id: z.string() }),
})
afterEach(() => vi.unstubAllGlobals())

/** Boundary stubs verify real session/role dispatch only; actual fulfillment/races live in D1 tests. */
function boundaryStore(record: BillingAuthority) {
  return {
    reserve: vi.fn(() => Promise.resolve(record)),
    get: vi.fn<BillingStore['get']>(() => Promise.resolve(record)),
    forOrganization: vi.fn(() => Promise.resolve(record)),
    forOwner: vi.fn((ownerId, plan) =>
      Promise.resolve(ownerId === record.ownerId && plan === record.plan ? record : null),
    ),
    personal: vi.fn(() => Promise.resolve(null)),
    bannedChargeable: vi.fn(() => Promise.resolve([])),
    isActivePayer: vi.fn(() => Promise.resolve(true)),
    workspace: vi.fn(() =>
      Promise.resolve({
        organizationId: record.id,
        name: 'Billing Shared',
        kind: 'shared' as const,
      }),
    ),
    replace: vi.fn(() => Promise.resolve(record)),
    bindCustomer: vi.fn(() => Promise.resolve()),
    bindCheckout: vi.fn(() => Promise.resolve()),
    claimEvent: vi.fn(() => Promise.resolve(true)),
    finishIgnoredEvent: vi.fn(() => Promise.resolve()),
    acquire: vi.fn(() => Promise.resolve(true)),
    release: vi.fn(() => Promise.resolve()),
    reconcile: vi.fn(() => Promise.resolve()),
  } satisfies BillingStore
}
async function fixture() {
  const harness = createTestHarness()
  const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
    name: 'Billing Shared',
    slug: 'billing-shared',
  })
  const person = sessionSchema.parse(await responseJson(owner.get('/api/auth/get-session')))
  const authority = stripeAuthority({
    id: organizationId,
    organizationId,
    ownerId: person.user.id,
    plan: 'team',
  })
  const provider = installStripeFixture(authority)
  provider.change('/v1/checkout/sessions/cs_test_Fixture', {
    status: 'open',
    subscription: null,
    url: 'https://checkout.stripe.com/c/pay/cs_test_Fixture',
    metadata: { lumafoil_authority: authority.id, lumafoil_checkout: authority.requestId },
  })
  const store = boundaryStore(authority)
  harness.services.billing = {
    store,
    provider: {
      config: STRIPE_FIXTURE_CONFIG,
      gateway: createStripeGateway(STRIPE_FIXTURE_CONFIG),
    },
  }
  return {
    harness,
    owner,
    organizationId,
    authority,
    provider,
    store,
    person,
    intent: { requestId: authority.requestId, plan: 'team', organizationId },
  }
}

describe('real-auth billing role and scope boundary', () => {
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'requires current workspace owner even for a historical payer: %s',
    async (role) => {
      const { harness, owner, organizationId, authority, intent, provider } = await fixture()
      let actor = owner
      if (role === 'non-member' || role === 'anonymous') {
        actor = new TestClient(harness.app, harness.env)
        if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, OTHER)
      } else if (role !== 'owner')
        actor = await joinAsMember(harness, owner, organizationId, OTHER, role)
      if (role !== 'anonymous')
        authority.ownerId = sessionSchema.parse(
          await responseJson(actor.get('/api/auth/get-session')),
        ).user.id
      const deniedStatus = role === 'anonymous' ? 401 : 403
      const expected = role === 'owner' ? 200 : deniedStatus
      for (const path of [
        CHECKOUT,
        '/api/me/billing/portal',
        '/api/me/billing/reconcile',
        '/api/me/billing/checkout/cancel',
      ]) {
        const response = await actor.post(path, path === CHECKOUT ? intent : scope)
        expect(response.status).toBe(expected)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
      }
      if (role !== 'owner') expect(provider.fetch).not.toHaveBeenCalled()
      expect(
        await responseStatus(
          actor.post(CHECKOUT, { ...intent, organizationId: 'unrelated-workspace' }),
        ),
      ).toBe(role === 'anonymous' ? 401 : 403)
    },
  )
  it('keeps absent-provider overview truthful and read-only while refusing financial mutations', async () => {
    const { harness, owner, store, provider, intent } = await fixture()
    harness.services.billing.provider = undefined
    vi.mocked(store.forOwner).mockResolvedValue(null)
    const result = billingOverviewSchema.parse(await responseJson(owner.get('/api/me/billing')))
    expect(result).toMatchObject({
      configured: false,
      personal: {
        organizationId: null,
        workspaceName: null,
        kind: 'personal',
        plan: 'free',
        canCheckout: false,
        canManageBilling: false,
      },
      team: null,
    })
    expect(store.reserve).not.toHaveBeenCalled()
    expect(store.reconcile).not.toHaveBeenCalled()
    expect(provider.fetch).not.toHaveBeenCalled()
    expect(await responseStatus(owner.post(CHECKOUT, intent))).toBe(503)
  })
  it('reads state without granting capacity, returns server financial eligibility and accepts no provider identities', async () => {
    const { owner, store, authority } = await fixture()
    const result = billingOverviewSchema.parse(await responseJson(owner.get('/api/me/billing')))
    expect(result.team).toMatchObject({
      organizationId: authority.organizationId,
      kind: 'shared',
      plan: 'free',
      checkoutState: 'open',
      canCheckout: true,
      canManageBilling: true,
    })
    expect(store.reconcile).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('cus_')
    expect(
      await responseStatus(
        owner.post('/api/me/billing/portal', { ...scope, customerId: 'cus_Foreign' }),
      ),
    ).toBe(400)
  })
  it('rejects expired credential proof, unverified/banned/pending user and foreign origin before provider effects', async () => {
    const { harness, owner, person, intent, provider } = await fixture()
    owner.useOrigin('https://foreign.test')
    expect(await responseStatus(owner.post(CHECKOUT, intent))).toBe(403)
    owner.useOrigin('http://localhost:5273')
    const context = await harness.services.auth.$context
    for (const update of [
      { emailVerified: false },
      { emailVerified: true, banned: true },
      { banned: false, membershipCohort: 'pending' },
    ]) {
      await context.adapter.update({
        model: 'user',
        where: [{ field: 'id', value: person.user.id }],
        update,
      })
      expect(await responseStatus(owner.post(CHECKOUT, intent))).toBe(403)
    }
    await context.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: person.user.id }],
      update: { membershipCohort: 'private' },
    })
    await context.adapter.update({
      model: 'session',
      where: [{ field: 'id', value: person.session.id }],
      update: { credentialVerifiedAt: new Date(Date.now() - RECENT_AUTHENTICATION_WINDOW_MS) },
    })
    expect(await responseJson(owner.post(CHECKOUT, intent))).toEqual({
      error: 'recent_authentication_required',
    })
    expect(provider.fetch).not.toHaveBeenCalled()
  })
  it.each([
    { customerId: 'cus_Foreign' },
    { priceId: 'price_Free' },
    { successUrl: 'https://evil.test' },
    { plan: 'enterprise' },
    { requestId: 'bad' },
    { annual: true },
  ])('refuses browser billing authority %j', async (patch) => {
    const { owner, intent, provider } = await fixture()
    expect(await responseStatus(owner.post(CHECKOUT, { ...intent, ...patch }))).toBe(400)
    expect(provider.fetch).not.toHaveBeenCalled()
  })
  it('dispatches a fresh personal Checkout through the actual SDK without simulating fulfillment', async () => {
    const { harness, owner, person } = await fixture()
    const id = await harness.services.accounts.ensurePrivateWorkspace(person.user.id)
    const record = stripeAuthority({
      id,
      organizationId: id,
      ownerId: person.user.id,
      plan: 'pro',
      customerId: null,
      checkoutSessionId: null,
      checkoutState: 'none',
      chargeable: true,
    })
    const provider = installStripeFixture(record)
    const store = boundaryStore(record)
    harness.services.billing = {
      store,
      provider: {
        config: STRIPE_FIXTURE_CONFIG,
        gateway: createStripeGateway(STRIPE_FIXTURE_CONFIG),
      },
    }
    expect(
      await responseStatus(owner.post(CHECKOUT, { requestId: record.requestId, plan: 'pro' })),
    ).toBe(200)
    expect(store.bindCustomer).toHaveBeenCalledWith(record, expect.any(String), 'cus_Fixture')
    expect(store.bindCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ id, customerId: 'cus_Fixture' }),
      expect.any(String),
      'cs_test_Fixture',
    )
    expect(provider.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2)
  })
  it('refuses another Checkout after current provider state proves a completed paid purchase', async () => {
    const { owner, provider, intent, store } = await fixture()
    provider.completeCheckout()
    expect(await responseStatus(owner.post(CHECKOUT, intent))).toBe(409)
    expect(store.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'team' }),
      expect.any(String),
      expect.objectContaining({
        chargeable: true,
        snapshot: expect.objectContaining({ subscriptionStatus: 'active' }),
      }),
      expect.any(Date),
    )
    expect(provider.fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
  it('dispatches verified signed events without simulating fulfillment and refuses altered raw bytes', async () => {
    const { harness, provider, store, authority } = await fixture()
    provider.completeCheckout()
    const event = stripeEvent()
    const raw = JSON.stringify(event)
    const signature = await signStripeBody(raw)
    const send = async (body: string, signed = signature) =>
      await harness.app.request(
        `http://localhost:5273${BILLING_POLICY.webhookPath}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'stripe-signature': signed },
          body,
        },
        harness.env,
      )
    expect(await responseStatus(send(raw))).toBe(200)
    expect(store.reconcile).toHaveBeenCalledWith(
      authority,
      expect.any(String),
      expect.objectContaining({
        chargeable: true,
        snapshot: expect.objectContaining({ subscriptionStatus: 'active' }),
      }),
      expect.any(Date),
      event.id,
    )
    store.reconcile.mockClear()
    expect(await responseStatus(send(raw + ' '))).toBe(400)
    expect(store.reconcile).not.toHaveBeenCalled()
    store.claimEvent.mockResolvedValueOnce(false)
    expect(await responseStatus(send(raw))).toBe(200)
    expect(store.reconcile).not.toHaveBeenCalled()
  })
  it('ignores absent or stale event authority and refuses crossed customer ownership before dispatch', async () => {
    const { harness, provider, store, authority } = await fixture()
    const event = stripeEvent('customer.subscription.updated')
    const raw = JSON.stringify(event)
    const headers = {
      'content-type': 'application/json',
      'stripe-signature': await signStripeBody(raw),
    }
    const send = async () =>
      await harness.app.request(
        `http://localhost:5273${BILLING_POLICY.webhookPath}`,
        { method: 'POST', headers, body: raw },
        harness.env,
      )
    store.get.mockResolvedValueOnce(null)
    expect(await responseStatus(send())).toBe(200)
    expect(store.finishIgnoredEvent).toHaveBeenCalledWith(event.id)
    provider.change('/v1/subscriptions/sub_Fixture', {
      metadata: { lumafoil_authority: authority.id, lumafoil_checkout: 'old-request' },
    })
    expect(await responseStatus(send())).toBe(200)
    expect(store.reconcile).not.toHaveBeenCalled()
    provider.change('/v1/subscriptions/sub_Fixture', {
      customer: 'cus_Foreign',
      metadata: { lumafoil_authority: authority.id, lumafoil_checkout: authority.requestId },
    })
    expect(await responseStatus(send())).toBe(403)
    expect(store.reconcile).not.toHaveBeenCalled()
  })
})
