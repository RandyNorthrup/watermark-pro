import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { BILLING_POLICY } from '../../shared/billing'
import { billingOverviewSchema } from '../../shared/billing-client'
import { PRIVATE_PLAN_CAPACITY, PUBLIC_PLANS, workspaceCapacity } from '../../shared/plans'
import { retryBannedBilling } from '../billing-lifecycle'
import type { BillingProviderState } from '../billing-store'
import { createD1BillingStore } from '../db/billing-store'
import { organization, user } from '../db/schema'
import { createApp } from '../index'
import { getServices } from '../services'
import { createStripeGateway } from '../stripe-gateway'
import { TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import {
  billingValue,
  stripeFixtureUrl,
  installStripeFixture,
  signStripeBody,
  STRIPE_FIXTURE_CONFIG,
  stripeAuthority,
  stripeEvent,
} from '../test-support/stripe-fixture'

const OWNER = {
  name: 'D1 Billing Owner',
  email: 'd1-billing-owner@example.test',
  password: 'a D1 billing owner fixture passphrase',
}
const services = getServices(env)
const store = createD1BillingStore(env.DB)
services.billing = {
  store,
  provider: { config: STRIPE_FIXTURE_CONFIG, gateway: createStripeGateway(STRIPE_FIXTURE_CONFIG) },
}
const app = createApp({
  resolveServices: () => {
    services.billing.provider = {
      config: STRIPE_FIXTURE_CONFIG,
      gateway: createStripeGateway(STRIPE_FIXTURE_CONFIG),
    }
    return services
  },
})
let manager: TestClient
let owner: TestClient
let ownerId: string
let personal: string
let shared: string
beforeAll(async () => {
  if (services.devMailbox === undefined)
    throw new Error('D1 billing fixture requires console mailbox.')
  owner = new TestClient(app, env)
  await owner.signUpAndVerify(services.devMailbox, OWNER)
  ownerId = z
    .object({ user: z.object({ id: z.string() }) })
    .parse(await responseJson(owner.get('/api/auth/get-session'))).user.id
  personal = await services.accounts.ensurePrivateWorkspace(ownerId)
  shared = await owner.createOrganization('Private shared fixture', 'private-shared-fixture')
  manager = new TestClient(app, env)
  await manager.signUpAndVerify(services.devMailbox, {
    ...OWNER,
    name: 'D1 lifecycle manager',
    email: 'd1-lifecycle-manager@example.test',
  })
  expect(await services.users.promoteToSiteOwner('d1-lifecycle-manager@example.test')).toBe(true)
})
afterEach(() => vi.unstubAllGlobals())
beforeEach(async () => {
  // This workerd file shares D1 between cases; reset its named billing fixtures only.
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE billing_workspace SET chargeable = 0, lease_token = NULL, lease_until = NULL',
    ),
    env.DB.prepare("DELETE FROM organization WHERE creation_kind = 'paid'"),
    env.DB.prepare('DELETE FROM billing_event'),
    env.DB.prepare('DELETE FROM billing_workspace'),
    env.DB.prepare(
      "DELETE FROM user WHERE email LIKE 'd1-lifecycle-%@example.test' AND email <> 'd1-lifecycle-manager@example.test'",
    ),
    env.DB.prepare(
      'UPDATE workspace_plan SET paid_plan = NULL, paid_through = NULL, paid_access_suspended = 0, revision = 0',
    ),
    env.DB.prepare("UPDATE user SET banned = 0, membership_cohort = 'private' WHERE id = ?").bind(
      ownerId,
    ),
    env.DB.prepare(
      "UPDATE workspace_plan SET base_plan = 'private', base_member_limit = 1 WHERE organization_id = ?",
    ).bind(personal),
  ])
})
async function webhook(type = 'invoice.paid', id = 'evt_Fixture') {
  const body = JSON.stringify(stripeEvent(type, id))
  return await app.request(
    `http://localhost:5273${BILLING_POLICY.webhookPath}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': await signStripeBody(body),
      },
      body,
    },
    env,
  )
}
async function pro() {
  const authority = stripeAuthority({ id: personal, organizationId: personal, ownerId })
  const provider = installStripeFixture(authority)
  expect(
    await responseStatus(
      owner.post('/api/me/billing/checkout', { requestId: authority.requestId, plan: 'pro' }),
    ),
  ).toBe(200)
  return { authority, provider }
}
async function paidSharedTeam() {
  const authority = stripeAuthority({ id: shared, organizationId: shared, ownerId, plan: 'team' })
  const provider = installStripeFixture(authority)
  expect(
    await responseStatus(
      owner.post('/api/me/billing/checkout', {
        requestId: authority.requestId,
        plan: 'team',
        organizationId: shared,
      }),
    ),
  ).toBe(200)
  provider.completeCheckout()
  expect(await responseStatus(webhook())).toBe(200)
  return provider
}
async function overview() {
  return billingOverviewSchema.parse(await responseJson(owner.get('/api/me/billing')))
}
async function current(id: string) {
  const record = await store.get(id)
  if (record === null) throw new Error('Expected actual D1 billing authority.')
  return record
}
function paid(end: number): BillingProviderState {
  return {
    checkoutSessionId: 'cs_test_Fixture',
    checkoutState: 'complete',
    checkoutUrl: null,
    chargeable: true,
    snapshot: {
      subscriptionId: 'sub_Fixture',
      subscriptionStatus: 'active',
      paidThrough: new Date(end * 1000),
      suspended: false,
      cancelAtPeriodEnd: false,
      invoiceId: 'in_Fixture',
    },
  }
}

describe('one actual D1 billing authority', () => {
  it('binds customer and Checkout for a verified historical payer whose ban flag is null', async () => {
    await env.DB.prepare('UPDATE user SET banned = NULL WHERE id = ?').bind(ownerId).run()
    const { provider } = await pro()
    expect(await current(personal)).toMatchObject({
      customerId: 'cus_Fixture',
      checkoutSessionId: 'cs_test_Fixture',
      checkoutState: 'open',
    })
    const requestId = crypto.randomUUID()
    expect(
      await responseStatus(owner.post('/api/me/billing/checkout', { requestId, plan: 'pro' })),
    ).toBe(200)
    expect(
      provider.fetch.mock.calls.filter(
        ([input, init]) =>
          stripeFixtureUrl(input).endsWith('/checkout/sessions') && init?.method === 'POST',
      ),
    ).toHaveLength(1)
  })
  it.each(['customer', 'checkout'] as const)(
    'refuses %s binding when a security ban lands during the provider response',
    async (phase) => {
      const authority = stripeAuthority({ id: personal, organizationId: personal, ownerId })
      const provider = installStripeFixture(authority)
      const fetch = provider.fetch.getMockImplementation()
      if (fetch === undefined) throw new Error('Missing Stripe fixture implementation.')
      provider.fetch.mockImplementation(async (input, init) => {
        const response = await fetch(input, init)
        const endpoint = phase === 'customer' ? '/v1/customers' : '/v1/checkout/sessions'
        if (init?.method === 'POST' && stripeFixtureUrl(input).endsWith(endpoint))
          await env.DB.prepare('UPDATE user SET banned = 1 WHERE id = ?').bind(ownerId).run()
        return response
      })
      expect(
        await responseStatus(
          owner.post('/api/me/billing/checkout', { requestId: authority.requestId, plan: 'pro' }),
        ),
      ).toBe(503)
      expect(await current(personal)).toMatchObject({
        customerId: phase === 'customer' ? null : 'cus_Fixture',
        checkoutSessionId: null,
        paidThrough: null,
        suspended: true,
      })
      const requestId = crypto.randomUUID()
      expect(
        await responseStatus(owner.post('/api/me/billing/checkout', { requestId, plan: 'pro' })),
      ).toBe(403)
    },
  )
  it('resumes open Checkout across request UUIDs and local expiry, prevents changing intent until provider closure', async () => {
    const { provider } = await pro()
    await env.DB.prepare('UPDATE billing_workspace SET checkout_expires_at = 0 WHERE id = ?')
      .bind(personal)
      .run()
    const retryRequest = crypto.randomUUID()
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', { requestId: retryRequest, plan: 'pro' }),
      ),
    ).toBe(200)
    expect(
      provider.fetch.mock.calls.filter(
        ([input, init]) =>
          stripeFixtureUrl(input).endsWith('/checkout/sessions') && init?.method === 'POST',
      ),
    ).toHaveLength(1)
    await expect(
      env.DB.prepare('DELETE FROM user WHERE id = ?').bind(ownerId).run(),
    ).rejects.toThrow('billing_cancel_before_account_deletion')
    expect(workspaceCapacity(await services.plans.get(personal)).storageBytes).toBe(
      PRIVATE_PLAN_CAPACITY.storageBytes,
    )
    expect(await billingValue(overview(), (value) => value.personal)).toMatchObject({
      checkoutState: 'open',
      canCheckout: true,
      canManageBilling: true,
      plan: 'free',
    })
  })
  it('does not provision on GET, recovers completed payment without webhook by explicit scoped POST and discovers Team', async () => {
    const requestId = crypto.randomUUID()
    const authority = stripeAuthority({
      id: requestId,
      organizationId: null,
      ownerId,
      plan: 'team',
      requestId,
      newWorkspaceName: 'Paid Team',
    })
    const provider = installStripeFixture(authority)
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', {
          requestId,
          plan: 'team',
          newWorkspaceName: 'Paid Team',
        }),
      ),
    ).toBe(200)
    provider.completeCheckout()
    expect(await billingValue(overview(), (value) => value.team)).toMatchObject({
      organizationId: null,
      checkoutState: 'open',
      workspaceName: 'Paid Team',
    })
    expect(await services.workspaceAccess.isOwner(requestId, ownerId)).toBe(false)
    const recovered = billingOverviewSchema.parse(
      await responseJson(owner.post('/api/me/billing/reconcile', { plan: 'team' })),
    )
    expect(recovered.team).toMatchObject({
      organizationId: requestId,
      kind: 'shared',
      plan: 'team',
      workspaceName: 'Paid Team',
      canCheckout: false,
    })
    expect(await services.accounts.ensurePrivateWorkspace(ownerId)).toBe(personal)
    expect(await services.accounts.isPrivateWorkspace(requestId)).toBe(false)
    const [created] = await services.db
      .select()
      .from(organization)
      .where(eq(organization.id, requestId))
    expect(created?.creationKind).toBe('paid')
    expect(await billingValue(services.plans.get(requestId), (value) => value.basePlan)).toBe(
      'free',
    )
  })
  it('keeps delayed completed Checkout chargeable beyond local expiry, refuses second charge and deletion until verified terminal state', async () => {
    const { provider } = await pro()
    provider.completeCheckout()
    await env.DB.prepare('UPDATE billing_workspace SET checkout_expires_at = 0 WHERE id = ?')
      .bind(personal)
      .run()
    const retryRequest = crypto.randomUUID()
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', { requestId: retryRequest, plan: 'pro' }),
      ),
    ).toBe(409)
    expect(await billingValue(current(personal), (value) => value.chargeable)).toBe(true)
    expect(workspaceCapacity(await services.plans.get(personal)).storageBytes).toBe(
      PUBLIC_PLANS.pro.storageBytes,
    )
    await expect(
      env.DB.prepare('DELETE FROM organization WHERE id = ?').bind(personal).run(),
    ).rejects.toThrow('billing_cancel_before_workspace_deletion')
    expect(await responseStatus(owner.post('/api/me/billing/portal', { plan: 'pro' }))).toBe(200)
    provider.change('/v1/subscriptions/sub_Fixture', { status: 'canceled' })
    expect(await responseStatus(owner.post('/api/me/billing/reconcile', { plan: 'pro' }))).toBe(200)
    expect(await billingValue(current(personal), (value) => value.chargeable)).toBe(false)
    await expect(
      env.DB.prepare('DELETE FROM organization WHERE id = ?').bind(personal).run(),
    ).resolves.toBeDefined()
  })
  it('serializes signed duplicates, retrieves current status for older events and expires paid capacity locally', async () => {
    const { provider } = await pro()
    provider.completeCheckout()
    const results = await Promise.all([webhook(), webhook(), webhook()])
    expect(results.some((response) => response.status === 200)).toBe(true)
    const receipt = await env.DB.prepare(
      "SELECT outcome FROM billing_event WHERE id = 'evt_Fixture'",
    ).first('outcome')
    expect(receipt).toBe('reconciled')
    const plan = await services.plans.get(personal)
    expect(workspaceCapacity(plan).storageBytes).toBe(PUBLIC_PLANS.pro.storageBytes)
    expect(workspaceCapacity(plan, provider.end * 1000).storageBytes).toBe(
      PRIVATE_PLAN_CAPACITY.storageBytes,
    )
    provider.change('/v1/subscriptions/sub_Fixture', { status: 'canceled' })
    expect(await responseStatus(webhook('customer.subscription.updated', 'evt_Older'))).toBe(200)
    expect(await billingValue(current(personal), (value) => value.chargeable)).toBe(false)
    expect(
      await billingValue(services.plans.get(personal), (value) => value.paidAccessSuspended),
    ).toBe(true)
  })
  it('permits cancelled open Team intent to change name; preserves old generation from signed replay and fenced commit', async () => {
    const firstRequest = crypto.randomUUID()
    const authority = stripeAuthority({
      id: firstRequest,
      organizationId: null,
      ownerId,
      plan: 'team',
      requestId: firstRequest,
      newWorkspaceName: 'First team',
    })
    const provider = installStripeFixture(authority)
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', {
          requestId: firstRequest,
          plan: 'team',
          newWorkspaceName: 'First team',
        }),
      ),
    ).toBe(200)
    const secondRequest = crypto.randomUUID()
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', {
          requestId: secondRequest,
          plan: 'team',
          newWorkspaceName: 'Second team',
        }),
      ),
    ).toBe(409)
    const cancelled = billingOverviewSchema.parse(
      await responseJson(owner.post('/api/me/billing/checkout/cancel', { plan: 'team' })),
    )
    expect(cancelled.team).toMatchObject({
      organizationId: null,
      workspaceName: 'First team',
      checkoutState: 'expired',
      canCheckout: true,
    })
    const old = await current(firstRequest)
    provider.change('/v1/checkout/sessions', {
      id: 'cs_test_Second',
      url: 'https://checkout.stripe.com/c/pay/cs_test_Second',
    })
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', {
          requestId: secondRequest,
          plan: 'team',
          newWorkspaceName: 'Second team',
        }),
      ),
    ).toBe(200)
    const changed = await current(firstRequest)
    expect(changed).toMatchObject({
      requestId: secondRequest,
      newWorkspaceName: 'Second team',
      checkoutSessionId: 'cs_test_Second',
      chargeable: true,
    })
    const token = 'generation-fixture'
    expect(await store.acquire(firstRequest, token, new Date())).toBe(true)
    await expect(store.reconcile(old, token, paid(provider.end), new Date())).rejects.toMatchObject(
      { status: 503 },
    )
    await store.release(firstRequest, token)
    expect(await responseStatus(webhook('checkout.session.expired', 'evt_OldIntent'))).toBe(200)
    expect(await billingValue(current(firstRequest), (value) => value.requestId)).toBe(
      secondRequest,
    )
    expect(await services.workspaceAccess.isOwner(firstRequest, ownerId)).toBe(false)
  })
  it('fences late lease responses', async () => {
    const { provider } = await pro()
    const saved = await current(personal)
    const now = new Date()
    expect(await store.acquire(personal, 'old', now)).toBe(true)
    const takeover = new Date(now.getTime() + BILLING_POLICY.leaseMs)
    expect(await store.acquire(personal, 'new', takeover)).toBe(true)
    await expect(store.reconcile(saved, 'old', paid(provider.end), takeover)).rejects.toMatchObject(
      { status: 503 },
    )
    await store.reconcile(saved, 'new', paid(provider.end), takeover)
    expect(await billingValue(current(personal), (value) => value.subscriptionStatus)).toBe(
      'active',
    )
  })
  it('records paid events without admission while buyer is banned', async () => {
    const id = crypto.randomUUID()
    const team = stripeAuthority({
      id,
      organizationId: null,
      ownerId,
      requestId: id,
      plan: 'team',
      newWorkspaceName: 'Race team',
    })
    const teamProvider = installStripeFixture(team)
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', {
          requestId: id,
          plan: 'team',
          newWorkspaceName: 'Race team',
        }),
      ),
    ).toBe(200)
    teamProvider.completeCheckout()
    await services.db.update(user).set({ banned: true }).where(eq(user.id, ownerId))
    expect(await responseStatus(webhook())).toBe(200)
    expect(await current(id)).toMatchObject({
      subscriptionStatus: 'active',
      suspended: true,
      paidThrough: null,
    })
    expect(await services.workspaceAccess.isOwner(id, ownerId)).toBe(false)
    await services.db.update(user).set({ banned: false }).where(eq(user.id, ownerId))
    expect(await responseStatus(webhook('invoice.paid', 'evt_Unbanned'))).toBe(200)
    expect(await billingValue(services.plans.get(id), (value) => value.paidPlan)).toBe('team')
  })
  it('keeps actual public personal preparation idempotent at its one-seat limit before and during Pro Checkout', async () => {
    await services.db.update(user).set({ membershipCohort: 'public' }).where(eq(user.id, ownerId))
    await env.DB.prepare(
      "UPDATE workspace_plan SET base_plan = 'free', base_member_limit = 1, retained_member_limit = 1 WHERE organization_id = ?",
    )
      .bind(personal)
      .run()
    expect(await services.accounts.ensurePrivateWorkspace(ownerId)).toBe(personal)
    expect(await services.accounts.ensurePrivateWorkspace(ownerId)).toBe(personal)
    const { authority, provider } = await pro()
    const retryRequest = crypto.randomUUID()
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', { requestId: retryRequest, plan: 'pro' }),
      ),
    ).toBe(200)
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM member WHERE organization_id = ?')
        .bind(personal)
        .first('count'),
    ).toBe(1)
    expect(await services.workspaceAccess.isOwner(personal, ownerId)).toBe(true)
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', {
          requestId: authority.requestId,
          plan: 'team',
          organizationId: personal,
        }),
      ),
    ).toBe(403)
    expect(provider.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2)
  })
  it('supports Team repurchase on existing shared workspace after verified cancellation without granting private base', async () => {
    const provider = await paidSharedTeam()
    await expect(
      env.DB.prepare("UPDATE member SET role = 'viewer' WHERE organization_id = ?")
        .bind(shared)
        .run(),
    ).rejects.toThrow('billing_cancel_before_owner_removal')
    provider.change('/v1/subscriptions/sub_Fixture', { status: 'canceled' })
    expect(await responseStatus(owner.post('/api/me/billing/reconcile', { plan: 'team' }))).toBe(
      200,
    )
    const fresh = crypto.randomUUID()
    provider.change('/v1/checkout/sessions', {
      id: 'cs_test_Second',
      url: 'https://checkout.stripe.com/c/pay/cs_test_Second',
    })
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', {
          requestId: fresh,
          plan: 'team',
          organizationId: shared,
        }),
      ),
    ).toBe(200)
    expect(await billingValue(current(shared), (value) => value.requestId)).toBe(fresh)
    expect(await billingValue(overview(), (value) => value.team?.organizationId)).toBe(shared)
  })
  it('retains closed Team authority after deleting an upgraded shared workspace and permits a replacement name', async () => {
    const provider = await paidSharedTeam()
    provider.change('/v1/subscriptions/sub_Fixture', { status: 'canceled' })
    expect(await responseStatus(owner.post('/api/me/billing/reconcile', { plan: 'team' }))).toBe(
      200,
    )
    expect(
      await responseStatus(owner.post('/api/auth/organization/delete', { organizationId: shared })),
    ).toBe(200)
    expect(await billingValue(overview(), (value) => value.team)).toMatchObject({
      organizationId: null,
      workspaceName: null,
      checkoutState: 'complete',
      canCheckout: true,
    })
    provider.change('/v1/checkout/sessions', {
      id: 'cs_test_Replacement',
      url: 'https://checkout.stripe.com/c/pay/cs_test_Replacement',
    })
    const requestId = crypto.randomUUID()
    expect(
      await responseStatus(
        owner.post('/api/me/billing/checkout', {
          requestId,
          plan: 'team',
          newWorkspaceName: 'Replacement Team',
        }),
      ),
    ).toBe(200)
    expect(await current(shared)).toMatchObject({
      organizationId: null,
      requestId,
      newWorkspaceName: 'Replacement Team',
      checkoutSessionId: 'cs_test_Replacement',
    })
    expect(await services.workspaceAccess.isOwner(shared, ownerId)).toBe(false)
  })
})

/** Named D1 target keeps real credential sign-in while avoiding unrelated signup rate limits. */
let lifecycleFixtureCount = 0
async function lifecycleTarget() {
  const context = await services.auth.$context
  const id = crypto.randomUUID()
  const identity = {
    name: 'D1 lifecycle payer',
    email: `d1-lifecycle-${id}@example.test`,
    password: OWNER.password,
  }
  await context.adapter.create({
    model: 'user',
    forceAllowId: true,
    data: {
      id,
      name: identity.name,
      email: identity.email,
      emailVerified: true,
      membershipCohort: 'private',
      role: 'user',
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
  const [credential] = await context.internalAdapter.findAccounts(ownerId)
  if (credential === undefined) throw new Error('Missing named owner credential fixture.')
  await context.adapter.create({
    model: 'account',
    data: { ...credential, id: crypto.randomUUID(), userId: id, accountId: id },
  })
  const client = new TestClient(app, env)
  lifecycleFixtureCount += 1
  // Independent trusted test IPs exercise the real limiter without sharing its one anonymous bucket.
  const fixtureIp = `192.0.2.${String(lifecycleFixtureCount)}`
  async function signIn() {
    const response = await client.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': fixtureIp },
      body: JSON.stringify({ email: identity.email, password: identity.password }),
    })
    expect(response.status).toBe(200)
  }
  await signIn()
  const organizationId = await services.accounts.ensurePrivateWorkspace(id)
  const authority = stripeAuthority({ id: organizationId, organizationId, ownerId: id })
  const provider = installStripeFixture(authority)
  expect(
    await responseStatus(
      client.post('/api/me/billing/checkout', { requestId: authority.requestId, plan: 'pro' }),
    ),
  ).toBe(200)
  provider.completeCheckout()
  expect(await responseStatus(client.post('/api/me/billing/reconcile', { plan: 'pro' }))).toBe(200)
  return { id, client, identity, organizationId, authority, provider, context, signIn }
}
function unavailable(provider: ReturnType<typeof installStripeFixture>) {
  const fetch = provider.fetch.getMockImplementation()
  if (fetch === undefined) throw new Error('Missing Stripe fixture implementation.')
  provider.fetch.mockImplementation((input, init) =>
    init?.method === 'DELETE'
      ? Promise.resolve(
          Response.json(
            { error: { type: 'api_error', message: 'Named D1 provider outage' } },
            { status: 503 },
          ),
        )
      : fetch(input, init),
  )
  return () => provider.fetch.mockImplementation(fetch)
}
function pauseUserDeletion(context: Awaited<typeof services.auth.$context>, id: string) {
  const removalReady = Promise.withResolvers<undefined>()
  const removalResume = Promise.withResolvers<undefined>()
  const remove = context.adapter.delete.bind(context.adapter)
  const deleteSpy = vi.spyOn(context.adapter, 'delete').mockImplementation(async (input) => {
    if (
      input.model === 'user' &&
      input.where.some((where) => where.field === 'id' && where.value === id)
    ) {
      removalReady.resolve(undefined)
      await removalResume.promise
    }
    await remove(input)
  })
  return { removalReady, removalResume, deleteSpy }
}
describe('actual D1 account closure and ban lifecycle', () => {
  it.each(['self', 'admin'] as const)(
    '%s deletion preserves actual password rows on failure and cancels renewal before retry removes user',
    async (actor) => {
      const { id, client, identity, organizationId, authority, provider, context, signIn } =
        await lifecycleTarget()
      const remove = () =>
        actor === 'self'
          ? client.post('/api/auth/delete-user', { password: identity.password })
          : manager.post('/api/auth/admin/remove-user', { userId: id })
      const restore = unavailable(provider)
      expect(await responseStatus(remove())).toBe(503)
      expect(
        await env.DB.prepare('SELECT banned FROM user WHERE id = ?').bind(id).first('banned'),
      ).toBe(0)
      expect(await context.internalAdapter.findAccounts(id)).toHaveLength(1)
      expect(await current(organizationId)).toMatchObject({
        chargeable: true,
        suspended: true,
        paidThrough: null,
      })
      expect(
        await env.DB.prepare('SELECT id FROM organization WHERE id = ?')
          .bind(organizationId)
          .first(),
      ).not.toBeNull()
      expect(
        await env.DB.prepare('SELECT organization_id FROM private_workspace WHERE user_id = ?')
          .bind(id)
          .first('organization_id'),
      ).toBe(organizationId)
      expect(await services.plans.get(organizationId)).toMatchObject({
        organizationId,
        paidAccessSuspended: true,
        paidThrough: null,
      })
      await signIn()
      restore()
      expect(await responseStatus(remove())).toBe(200)
      expect(await env.DB.prepare('SELECT id FROM user WHERE id = ?').bind(id).first()).toBeNull()
      expect(await context.internalAdapter.findAccounts(id)).toHaveLength(0)
      expect(await current(organizationId)).toMatchObject({
        id: authority.id,
        organizationId: null,
        ownerId: null,
        customerId: authority.customerId,
        subscriptionId: 'sub_Fixture',
        chargeable: false,
        subscriptionStatus: 'canceled',
        paidThrough: null,
        suspended: true,
      })
      for (const [table, column] of [
        ['organization', 'id'],
        ['workspace_plan', 'organization_id'],
        ['private_workspace', 'organization_id'],
        ['member', 'organization_id'],
      ] as const) {
        expect(
          await env.DB.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`)
            .bind(organizationId)
            .first(),
        ).toBeNull()
      }
      await expect(services.plans.get(organizationId)).rejects.toMatchObject({ status: 403 })
      expect(await responseStatus(client.post('/api/me/workspace', {}))).toBe(401)
      expect(provider.values.get('/v1/subscriptions/sub_Fixture')).toMatchObject({
        status: 'canceled',
        cancel_at_period_end: false,
      })
    },
  )
  it('security ban succeeds during provider outage, suspends immediately, ignores delayed paid access and existing cron closes renewals after recovery', async () => {
    const { id, organizationId, provider } = await lifecycleTarget()
    const restore = unavailable(provider)
    expect(
      await responseStatus(
        manager.post('/api/auth/admin/ban-user', {
          userId: id,
          banReason: 'D1 moderation fixture',
        }),
      ),
    ).toBe(200)
    expect(
      await env.DB.prepare('SELECT banned FROM user WHERE id = ?').bind(id).first('banned'),
    ).toBe(1)
    expect(await current(organizationId)).toMatchObject({
      chargeable: true,
      suspended: true,
      paidThrough: null,
    })
    expect(await responseStatus(webhook('invoice.paid', 'evt_BannedPaid'))).toBe(200)
    expect(await services.plans.get(organizationId)).toMatchObject({
      paidAccessSuspended: true,
      paidThrough: null,
    })
    await retryBannedBilling(services.billing)
    expect(await current(organizationId)).toMatchObject({ chargeable: true })
    restore()
    await retryBannedBilling(services.billing)
    expect(await current(organizationId)).toMatchObject({
      chargeable: false,
      subscriptionStatus: 'canceled',
      suspended: true,
      paidThrough: null,
    })
    expect(
      await env.DB.prepare('SELECT banned FROM user WHERE id = ?').bind(id).first('banned'),
    ).toBe(1)
  })
  it('rechecks live ban after an in-flight checkout lease, keeps credentials when deletion is busy, then permits retry', async () => {
    const { id, client, identity, organizationId, provider, signIn } = await lifecycleTarget()
    // Provider closure lets the existing generation start a replacement Checkout.
    provider.change('/v1/subscriptions/sub_Fixture', { status: 'canceled' })
    expect(await responseStatus(client.post('/api/me/billing/reconcile', { plan: 'pro' }))).toBe(
      200,
    )
    const acquired = Promise.withResolvers<undefined>()
    const checkoutResume = Promise.withResolvers<undefined>()
    const deletionQuiesced = Promise.withResolvers<undefined>()
    const deletionResume = Promise.withResolvers<undefined>()
    const acquire = store.acquire.bind(store)
    const spy = vi
      .spyOn(store, 'acquire')
      .mockImplementation(async (billingId, token, now, payer) => {
        const isGranted = await acquire(billingId, token, now, payer)
        if (billingId === organizationId && payer === id && isGranted) {
          acquired.resolve(undefined)
          await checkoutResume.promise
        } else if (billingId === organizationId && payer === undefined && !isGranted) {
          deletionQuiesced.resolve(undefined)
          await deletionResume.promise
        }
        return isGranted
      })
    const checkout = client.post('/api/me/billing/checkout', {
      requestId: crypto.randomUUID(),
      plan: 'pro',
    })
    await acquired.promise
    const removal = client.post('/api/auth/delete-user', { password: identity.password })
    await deletionQuiesced.promise
    expect(
      await env.DB.prepare('SELECT banned FROM user WHERE id = ?').bind(id).first('banned'),
    ).toBe(1)
    checkoutResume.resolve(undefined)
    expect(await responseStatus(checkout)).toBe(403)
    deletionResume.resolve(undefined)
    expect(await responseStatus(removal)).toBe(503)
    spy.mockRestore()
    expect(
      await env.DB.prepare('SELECT banned FROM user WHERE id = ?').bind(id).first('banned'),
    ).toBe(0)
    await signIn()
    expect(
      await responseStatus(client.post('/api/auth/delete-user', { password: identity.password })),
    ).toBe(200)
    expect(await current(organizationId)).toMatchObject({ chargeable: false, ownerId: null })
  })
})

describe('actual final auth deletion boundary', () => {
  it('quiesces nullable historical bans before provider effects and recovers paid access through explicit reconcile after failed removal', async () => {
    const { id, client, identity, organizationId, provider, context, signIn } =
      await lifecycleTarget()
    await env.DB.prepare('UPDATE user SET banned = NULL WHERE id = ?').bind(id).run()
    const fetch = provider.fetch.getMockImplementation()
    if (fetch === undefined) throw new Error('Missing Stripe fixture implementation.')
    const attempted = Promise.withResolvers<undefined>()
    const resume = Promise.withResolvers<undefined>()
    provider.fetch.mockImplementation(async (input, init) => {
      if (init?.method !== 'DELETE') return await fetch(input, init)
      attempted.resolve(undefined)
      await resume.promise
      return Response.json(
        { error: { type: 'api_error', message: 'Named nullable-history outage' } },
        { status: 503 },
      )
    })
    const removal = client.post('/api/auth/delete-user', { password: identity.password })
    await attempted.promise
    expect(
      await env.DB.prepare('SELECT banned FROM user WHERE id = ?').bind(id).first('banned'),
    ).toBe(1)
    resume.resolve(undefined)
    expect(await responseJson(removal)).toMatchObject({ code: 'BILLING_CLOSURE_PENDING' })
    expect(await context.internalAdapter.findAccounts(id)).toHaveLength(1)
    expect(await current(organizationId)).toMatchObject({
      chargeable: true,
      suspended: true,
      paidThrough: null,
    })
    await signIn()
    provider.fetch.mockImplementation(fetch)
    expect(await responseStatus(client.post('/api/me/billing/reconcile', { plan: 'pro' }))).toBe(
      200,
    )
    expect(await current(organizationId)).toMatchObject({
      chargeable: true,
      suspended: false,
      paidThrough: new Date(provider.end * 1000),
    })
    expect(await services.plans.get(organizationId)).toMatchObject({
      paidAccessSuspended: false,
      paidThrough: new Date(provider.end * 1000),
    })
  })
  it.each(['self', 'admin'] as const)(
    '%s removal permits an already-closed webhook lease, then refuses its post-deletion commit and ignores replay without resurrecting owner',
    async (actor) => {
      const { id, client, identity, organizationId, context } = await lifecycleTarget()
      const { removalReady, removalResume, deleteSpy } = pauseUserDeletion(context, id)
      const removal =
        actor === 'self'
          ? client.post('/api/auth/delete-user', { password: identity.password })
          : manager.post('/api/auth/admin/remove-user', { userId: id })
      await removalReady.promise
      expect(await current(organizationId)).toMatchObject({
        chargeable: false,
        subscriptionStatus: 'canceled',
      })
      const eventId = `evt_Closed${actor}`
      const eventReady = Promise.withResolvers<undefined>()
      const eventResume = Promise.withResolvers<undefined>()
      const reconcile = store.reconcile.bind(store)
      const reconcileSpy = vi.spyOn(store, 'reconcile').mockImplementation(async (...args) => {
        if (args[4] === eventId) {
          eventReady.resolve(undefined)
          await eventResume.promise
        }
        await reconcile(...args)
      })
      const event = webhook('invoice.paid', eventId)
      await eventReady.promise
      expect(
        await env.DB.prepare('SELECT lease_token FROM billing_workspace WHERE id = ?')
          .bind(organizationId)
          .first('lease_token'),
      ).not.toBeNull()
      removalResume.resolve(undefined)
      expect(await responseStatus(removal)).toBe(200)
      deleteSpy.mockRestore()
      eventResume.resolve(undefined)
      expect(await responseStatus(event)).toBe(503)
      reconcileSpy.mockRestore()
      expect(await current(organizationId)).toMatchObject({
        ownerId: null,
        chargeable: false,
        suspended: true,
        paidThrough: null,
      })
      expect(await store.acquire(organizationId, 'deleted-owner-attempt', new Date())).toBe(false)
      expect(await responseStatus(webhook('invoice.paid', eventId))).toBe(200)
      expect(
        await env.DB.prepare('SELECT outcome FROM billing_event WHERE id = ?')
          .bind(eventId)
          .first('outcome'),
      ).toBe('ignored')
      expect(await services.workspaceAccess.isOwner(organizationId, id)).toBe(false)
      expect(await context.internalAdapter.findAccounts(id)).toHaveLength(0)
    },
  )
  it('permits a queued cron lease after confirmed closure and never resurrects a removed banned owner', async () => {
    const { id, organizationId, context } = await lifecycleTarget()
    await env.DB.prepare('UPDATE user SET banned = 1 WHERE id = ?').bind(id).run()
    const listed = Promise.withResolvers<undefined>()
    const listResume = Promise.withResolvers<undefined>()
    const list = store.bannedChargeable.bind(store)
    const listSpy = vi.spyOn(store, 'bannedChargeable').mockImplementation(async () => {
      const rows = await list()
      listed.resolve(undefined)
      await listResume.promise
      return rows
    })
    const cron = retryBannedBilling(services.billing)
    await listed.promise
    const { removalReady, removalResume, deleteSpy } = pauseUserDeletion(context, id)
    const removal = manager.post('/api/auth/admin/remove-user', { userId: id })
    await removalReady.promise
    expect(await current(organizationId)).toMatchObject({ chargeable: false })
    const readReady = Promise.withResolvers<undefined>()
    const readResume = Promise.withResolvers<undefined>()
    const get = store.get.bind(store)
    const getSpy = vi.spyOn(store, 'get').mockImplementation(async (billingId) => {
      const row = await get(billingId)
      if (billingId === organizationId) {
        readReady.resolve(undefined)
        await readResume.promise
      }
      return row
    })
    listResume.resolve(undefined)
    await readReady.promise
    removalResume.resolve(undefined)
    expect(await responseStatus(removal)).toBe(200)
    deleteSpy.mockRestore()
    readResume.resolve(undefined)
    await cron
    getSpy.mockRestore()
    listSpy.mockRestore()
    expect(await current(organizationId)).toMatchObject({
      ownerId: null,
      chargeable: false,
      suspended: true,
      paidThrough: null,
    })
    expect(await store.acquire(organizationId, 'cron-deleted-owner', new Date())).toBe(false)
  })
})
