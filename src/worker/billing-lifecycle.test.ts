import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { closeAccountBilling, retryBannedBilling } from './billing-lifecycle'
import { createStripeGateway } from './stripe-gateway'
import { BILLING_POLICY } from '../shared/billing'
import { TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'
import {
  installStripeFixture,
  STRIPE_FIXTURE_CONFIG,
  stripeAuthority,
  stripeFixtureUrl,
} from './test-support/stripe-fixture'
import { createTestHarness } from './test-support/test-app'

const TARGET = {
  name: 'Lifecycle payer',
  email: 'lifecycle@example.test',
  password: 'lifecycle payer fixture password',
}
const MANAGER = {
  name: 'Lifecycle manager',
  email: 'manager@example.test',
  password: 'lifecycle manager fixture password',
}
const personSchema = z.object({ user: z.object({ id: z.string() }) })
afterEach(() => vi.unstubAllGlobals())
async function fixture() {
  const harness = createTestHarness()
  const target = new TestClient(harness.app, harness.env)
  await target.signUpAndVerify(harness.mailbox, TARGET)
  const userId = personSchema.parse(await responseJson(target.get('/api/auth/get-session'))).user.id
  const organizationId = await harness.services.accounts.ensurePrivateWorkspace(userId)
  const authority = stripeAuthority({ id: organizationId, organizationId, ownerId: userId })
  const provider = installStripeFixture(authority)
  const store = {
    ...harness.services.billing.store,
    forOwner: vi.fn((ownerId: string, plan: string) =>
      Promise.resolve(ownerId === userId && plan === 'pro' ? authority : null),
    ),
    get: vi.fn(() => Promise.resolve(authority)),
    acquire: vi.fn(() => Promise.resolve(true)),
    release: vi.fn(() => Promise.resolve()),
    reconcile: vi.fn(() => Promise.resolve()),
    bannedChargeable: vi.fn(() => Promise.resolve([authority])),
  }
  harness.services.billing = {
    store,
    provider: {
      config: STRIPE_FIXTURE_CONFIG,
      gateway: createStripeGateway(STRIPE_FIXTURE_CONFIG),
    },
  }
  const manager = new TestClient(harness.app, harness.env)
  await manager.signUpAndVerify(harness.mailbox, MANAGER)
  expect(await harness.services.users.promoteToSiteOwner(MANAGER.email)).toBe(true)
  const context = await harness.services.auth.$context
  async function person() {
    return await context.adapter.findOne<{ id: string; banned: boolean; banReason?: string }>({
      model: 'user',
      where: [{ field: 'id', value: userId }],
    })
  }
  return { harness, target, userId, authority, provider, store, manager, context, person }
}
function failCancellation(provider: ReturnType<typeof installStripeFixture>) {
  const fetch = provider.fetch.getMockImplementation()
  if (fetch === undefined) throw new Error('Missing named Stripe fixture implementation.')
  provider.fetch.mockImplementation((input, init) =>
    init?.method === 'DELETE'
      ? Promise.resolve(
          Response.json(
            { error: { message: 'Named fixture unavailable', type: 'api_error' } },
            { status: 503 },
          ),
        )
      : fetch(input, init),
  )
  return () => provider.fetch.mockImplementation(fetch)
}

describe('real-auth account billing lifecycle', () => {
  it.each(['self', 'admin'] as const)(
    '%s removal retains credentials on cleanup failure and retries after provider closure',
    async (actor) => {
      const { harness, target, manager, userId, provider, context, person } = await fixture()
      const stage = vi
        .spyOn(harness.services.uploads, 'stagePersonalDeletion')
        .mockRejectedValueOnce(new Error('Named cleanup persistence failure'))
      const remove = () =>
        actor === 'self'
          ? target.post('/api/auth/delete-user', { password: TARGET.password })
          : manager.post('/api/auth/admin/remove-user', { userId })
      expect(await responseJson(remove())).toMatchObject({ code: 'ACCOUNT_CLEANUP_PENDING' })
      expect(await person()).toMatchObject({ banned: false })
      expect(await context.internalAdapter.findAccounts(userId)).toHaveLength(1)
      expect(provider.values.get('/v1/subscriptions/sub_Fixture')).toMatchObject({
        status: 'canceled',
      })
      await target.signIn(TARGET)
      stage.mockResolvedValue(undefined)
      expect(await responseStatus(remove())).toBe(200)
      expect(await person()).toBeNull()
      expect(stage).toHaveBeenCalledTimes(2)
      expect(stage).toHaveBeenLastCalledWith(userId)
    },
  )
  it('keeps a concurrent real moderator ban when personal staging fails', async () => {
    const { harness, target, manager, userId, context, person } = await fixture()
    vi.spyOn(harness.services.uploads, 'stagePersonalDeletion').mockImplementation(async () => {
      expect(
        await responseStatus(
          manager.post('/api/auth/admin/ban-user', {
            userId,
            banReason: 'Concurrent cleanup moderation',
          }),
        ),
      ).toBe(200)
      throw new Error('Named cleanup persistence failure')
    })
    expect(
      await responseJson(target.post('/api/auth/delete-user', { password: TARGET.password })),
    ).toMatchObject({ code: 'ACCOUNT_CLEANUP_PENDING' })
    await Promise.all(harness.billingTasks)
    expect(await person()).toMatchObject({
      banned: true,
      banReason: 'Concurrent cleanup moderation',
    })
    expect(await context.internalAdapter.findAccounts(userId)).toHaveLength(1)
  })
  it.each(['self', 'admin'] as const)(
    '%s removal preserves credentials on provider failure, then cancels before deletion on retry',
    async (actor) => {
      const { target, manager, userId, provider, store, person, context } = await fixture()
      const remove = () =>
        actor === 'self'
          ? target.post('/api/auth/delete-user', { password: TARGET.password })
          : manager.post('/api/auth/admin/remove-user', { userId })
      const restore = failCancellation(provider)
      expect(await responseJson(remove())).toMatchObject({ code: 'BILLING_CLOSURE_PENDING' })
      expect(await person()).toMatchObject({ banned: false })
      expect(await context.internalAdapter.findAccounts(userId)).toHaveLength(1)
      await target.signIn(TARGET)
      expect(store.reconcile).not.toHaveBeenCalled()
      restore()
      expect(await responseStatus(remove())).toBe(200)
      expect(await person()).toBeNull()
      const remainingAccounts = await context.internalAdapter.findAccounts(userId)
      expect(remainingAccounts).toHaveLength(0)
      expect(store.reconcile).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: userId }),
        expect.any(String),
        expect.objectContaining({
          chargeable: false,
          snapshot: expect.objectContaining({
            subscriptionStatus: 'canceled',
            paidThrough: null,
            suspended: true,
          }),
        }),
        expect.any(Date),
      )
      const cancellation = provider.fetch.mock.calls.find(
        ([input, init]) =>
          new URL(stripeFixtureUrl(input)).pathname === '/v1/subscriptions/sub_Fixture' &&
          init?.method === 'DELETE',
      )
      expect(cancellation).toBeDefined()
      const cancellationUrl = new URL(stripeFixtureUrl(cancellation?.[0] ?? 'https://missing.test'))
      expect(cancellationUrl.searchParams.get('invoice_now')).toBe('false')
      expect(cancellationUrl.searchParams.get('prorate')).toBe('false')
    },
  )
  it('refuses wrong password, ordinary admin caller and protected owner before provider work', async () => {
    const { harness, target, manager, userId, provider } = await fixture()
    const stage = vi.spyOn(harness.services.uploads, 'stagePersonalDeletion')
    expect(
      await responseStatus(
        target.post('/api/auth/delete-user', { password: 'wrong fixture password' }),
      ),
    ).toBe(400)
    expect(await responseStatus(target.post('/api/auth/admin/remove-user', { userId }))).toBe(403)
    expect(
      await responseStatus(manager.post('/api/auth/delete-user', { password: MANAGER.password })),
    ).toBe(403)
    expect(provider.fetch).not.toHaveBeenCalled()
    expect(stage).not.toHaveBeenCalled()
  })
  it.each(['admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'refuses a workspace %s removing another account before provider or cleanup work',
    async (role) => {
      const { harness, target, userId, provider, context } = await fixture()
      const stage = vi.spyOn(harness.services.uploads, 'stagePersonalDeletion')
      const caller = new TestClient(harness.app, harness.env)
      if (role !== 'anonymous') {
        await caller.signUpAndVerify(harness.mailbox, {
          name: 'Cleanup role fixture',
          email: `${role}@cleanup-role.example.test`,
          password: TARGET.password,
        })
        if (role !== 'non-member') {
          const organizationId = await target.createOrganization(
            'Cleanup role workspace',
            `cleanup-${role}`,
          )
          const callerId = personSchema.parse(
            await responseJson(caller.get('/api/auth/get-session')),
          ).user.id
          await context.adapter.create({
            model: 'member',
            data: {
              id: crypto.randomUUID(),
              organizationId,
              userId: callerId,
              role,
              createdAt: new Date(),
            },
          })
        }
      }
      expect(await responseStatus(caller.post('/api/auth/admin/remove-user', { userId }))).toBe(
        role === 'anonymous' ? 401 : 403,
      )
      expect(provider.fetch).not.toHaveBeenCalled()
      expect(stage).not.toHaveBeenCalled()
    },
  )
  it('refuses a cross-origin self-removal before provider or personal cleanup', async () => {
    const { harness, target, provider } = await fixture()
    const stage = vi.spyOn(harness.services.uploads, 'stagePersonalDeletion')
    target.useOrigin('https://untrusted.example.test')
    expect(
      await responseStatus(target.post('/api/auth/delete-user', { password: TARGET.password })),
    ).toBe(403)
    expect(stage).not.toHaveBeenCalled()
    expect(provider.fetch).not.toHaveBeenCalled()
  })
  it.each(['self', 'admin'] as const)(
    'requires recent credential proof for %s removal before cleanup',
    async (actor) => {
      const { harness, target, manager, userId, provider, context } = await fixture()
      const stage = vi.spyOn(harness.services.uploads, 'stagePersonalDeletion')
      const caller = actor === 'self' ? target : manager
      const session = z
        .object({ session: z.object({ id: z.string() }) })
        .parse(await responseJson(caller.get('/api/auth/get-session')))
      await context.adapter.update({
        model: 'session',
        where: [{ field: 'id', value: session.session.id }],
        update: { credentialVerifiedAt: new Date(0) },
      })
      expect(
        await responseStatus(
          actor === 'self'
            ? caller.post('/api/auth/delete-user', { password: TARGET.password })
            : caller.post('/api/auth/admin/remove-user', { userId }),
        ),
      ).toBe(403)
      expect(stage).not.toHaveBeenCalled()
      expect(provider.fetch).not.toHaveBeenCalled()
    },
  )
  it('never rolls back a concurrent real moderator ban when provider closure fails; banned closure retries without granting access', async () => {
    const { target, manager, userId, provider, harness, person, store } = await fixture()
    const fetch = provider.fetch.getMockImplementation()
    if (fetch === undefined) throw new Error('Missing named Stripe fixture implementation.')
    const started = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    provider.fetch.mockImplementation(async (input, init) => {
      if (init?.method !== 'DELETE') return await fetch(input, init)
      started.resolve(undefined)
      await release.promise
      return Response.json(
        { error: { type: 'api_error', message: 'Named fixture unavailable' } },
        { status: 503 },
      )
    })
    const removal = target.post('/api/auth/delete-user', { password: TARGET.password })
    await started.promise
    expect(await person()).toMatchObject({
      banned: true,
      banReason: expect.stringContaining(BILLING_POLICY.deletionMarkerPrefix),
    })
    expect(
      await responseStatus(
        manager.post('/api/auth/admin/ban-user', {
          userId,
          banReason: 'Concurrent security moderation',
        }),
      ),
    ).toBe(200)
    release.resolve(undefined)
    expect(await responseStatus(removal)).toBe(503)
    await Promise.all(harness.billingTasks)
    expect(await person()).toMatchObject({
      banned: true,
      banReason: 'Concurrent security moderation',
    })
    expect(store.reconcile).not.toHaveBeenCalled()
    provider.fetch.mockImplementation(fetch)
    await retryBannedBilling(harness.services.billing)
    expect(store.reconcile).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      expect.objectContaining({
        chargeable: false,
        snapshot: expect.objectContaining({ suspended: true, paidThrough: null }),
      }),
      expect.any(Date),
    )
    const requestId = crypto.randomUUID()
    expect(
      await responseStatus(target.post('/api/me/billing/checkout', { requestId, plan: 'pro' })),
    ).toBe(401)
  })
  it('retains a busy authority and restores sign-in when removal loses the existing lease', async () => {
    const { target, store, provider, person } = await fixture()
    store.acquire.mockResolvedValue(false)
    expect(
      await responseStatus(target.post('/api/auth/delete-user', { password: TARGET.password })),
    ).toBe(503)
    expect(await person()).toMatchObject({ banned: false })
    await target.signIn(TARGET)
    expect(provider.fetch).not.toHaveBeenCalled()
  })
  it('permits authorized removal of an already-banned payer after confirmed cancellation', async () => {
    const { manager, userId, person, context, provider } = await fixture()
    await context.adapter.update({
      model: 'user',
      where: [{ field: 'id', value: userId }],
      update: { banned: true, banReason: 'Existing moderation' },
    })
    expect(await responseStatus(manager.post('/api/auth/admin/remove-user', { userId }))).toBe(200)
    expect(await person()).toBeNull()
    expect(provider.values.get('/v1/subscriptions/sub_Fixture')).toMatchObject({
      status: 'canceled',
    })
  })
  it('keeps lease protection for confirmed closed authority without requiring provider availability', async () => {
    const { harness, authority, store, provider, userId } = await fixture()
    authority.chargeable = false
    harness.services.billing.provider = undefined
    await closeAccountBilling(harness.services.billing, userId)
    expect(store.acquire).toHaveBeenCalled()
    expect(store.release).toHaveBeenCalled()
    expect(provider.fetch).not.toHaveBeenCalled()
  })
  it('refuses removal before provider effects when the quiescence update did not lock the live user', async () => {
    const { target, context, person, provider, userId } = await fixture()
    const update = context.adapter.update.bind(context.adapter)
    const spy = vi.spyOn(context.adapter, 'update').mockImplementation(async (input) => {
      if (input.model === 'user' && input.update['banned'] === true) return null
      return await update(input)
    })
    expect(
      await responseStatus(target.post('/api/auth/delete-user', { password: TARGET.password })),
    ).toBe(503)
    spy.mockRestore()
    expect(await person()).toMatchObject({ banned: false })
    expect(await context.internalAdapter.findAccounts(userId)).toHaveLength(1)
    expect(provider.fetch).not.toHaveBeenCalled()
  })
  it('refuses a foreign account before cancellation and releases the lease', async () => {
    const { harness, authority, store, provider, userId } = await fixture()
    authority.accountId = 'acct_ForeignFixture'
    await expect(closeAccountBilling(harness.services.billing, userId)).rejects.toMatchObject({
      status: 503,
    })
    expect(provider.fetch).not.toHaveBeenCalled()
    expect(store.release).toHaveBeenCalled()
  })
})
