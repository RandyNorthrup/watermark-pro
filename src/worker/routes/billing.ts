import { type Context, Hono } from 'hono'

import { BILLING_POLICY, type BillingAuthority } from '../../shared/billing'
import {
  billingCheckoutRequestSchema,
  billingOverviewSchema,
  billingScopeRequestSchema,
} from '../../shared/billing-client'
import type { AppContext } from '../app-context'
import type { BillingReservation } from '../billing-store'
import { apiErrors } from '../errors'
import { requireSession } from '../middleware/session'
import { readJsonBody } from '../request-body'
import type { Services } from '../services'

function configured(services: Services) {
  const provider = services.billing.provider
  if (provider === undefined) throw apiErrors.retryLater()
  return { ...provider, store: services.billing.store }
}
type Billing = ReturnType<typeof configured>
function scoped(authority: BillingAuthority, billing: Billing) {
  if (
    authority.accountId !== billing.config.accountId ||
    authority.liveMode !== billing.config.liveMode
  )
    throw apiErrors.forbidden()
}
async function owned(services: Services, authority: BillingAuthority, ownerId: string) {
  if (
    authority.ownerId !== ownerId ||
    (authority.organizationId !== null &&
      !(await services.workspaceAccess.isOwner(authority.organizationId, ownerId)))
  )
    throw apiErrors.forbidden()
}
async function leased<T>(
  services: Services,
  id: string,
  ownerId: string | undefined,
  run: (billing: Billing, current: BillingAuthority, token: string) => Promise<T>,
): Promise<T> {
  const billing = configured(services)
  const token = crypto.randomUUID()
  if (!(await billing.store.acquire(id, token, new Date(), ownerId))) throw apiErrors.retryLater()
  try {
    const current = await billing.store.get(id)
    if (current === null) throw apiErrors.conflict()
    scoped(current, billing)
    if (ownerId !== undefined) {
      if (!(await billing.store.isActivePayer(ownerId))) throw apiErrors.forbidden()
      await owned(services, current, ownerId)
    }
    return await run(billing, current, token)
  } finally {
    await billing.store.release(id, token)
  }
}
async function overview(services: Services, ownerId: string) {
  const { store, provider } = services.billing
  const canCharge =
    provider === undefined ? false : await provider.gateway.assertAccount('reconcile')
  const personal = await store.personal(ownerId)
  const personalAuthority =
    personal === null ? null : await store.forOrganization(personal.organizationId)
  const team = await store.forOwner(ownerId, 'team')
  async function status(
    record: BillingAuthority | null,
    kind: 'personal' | 'shared',
    workspace: { organizationId: string; name: string } | null,
  ) {
    if (record !== null) {
      await owned(services, record, ownerId)
      if (provider !== undefined) scoped(record, configured(services))
    }
    const isActive =
      record !== null &&
      !record.suspended &&
      record.paidThrough !== null &&
      record.paidThrough.getTime() > Date.now()
    return {
      organizationId: workspace?.organizationId ?? null,
      workspaceName: workspace?.name ?? record?.newWorkspaceName ?? null,
      kind,
      plan: isActive ? record.plan : 'free',
      subscriptionStatus: record?.subscriptionStatus ?? 'none',
      paidThrough: record?.paidThrough?.toISOString() ?? null,
      suspended: record?.suspended ?? false,
      cancelAtPeriodEnd: record?.cancelAtPeriodEnd ?? false,
      canManageBilling:
        provider !== undefined && record?.customerId !== null && record?.customerId !== undefined,
      canCheckout:
        canCharge &&
        (record === null || !record.chargeable || ['none', 'open'].includes(record.checkoutState)),
      checkoutState: record?.checkoutState ?? 'none',
    }
  }
  const teamWorkspace =
    team?.organizationId === null || team?.organizationId === undefined
      ? null
      : await store.workspace(team.organizationId, ownerId)
  return billingOverviewSchema.parse({
    configured: provider !== undefined,
    personal: await status(personalAuthority, 'personal', personal),
    team:
      team === null
        ? null
        : await status(
            team,
            'shared',
            teamWorkspace === null
              ? null
              : { organizationId: teamWorkspace.organizationId, name: teamWorkspace.name },
          ),
  })
}
async function financialScope(c: Context<AppContext>) {
  const parsed = billingScopeRequestSchema.safeParse(
    await readJsonBody(c.req.raw, BILLING_POLICY.requestBytes),
  )
  if (!parsed.success) throw apiErrors.validation('Invalid billing scope.')
  const services = c.get('services')
  const ownerId = c.get('session').user.id
  const record = await services.billing.store.forOwner(ownerId, parsed.data.plan)
  if (record === null) throw apiErrors.conflict()
  await owned(services, record, ownerId)
  return { services, ownerId, record }
}

/** Product intent, signed events and explicit payer recovery share one provider-authoritative flow. */
export const billingRoutes = new Hono<AppContext>()
  .get('/me/billing', requireSession, async (c) =>
    c.json(await overview(c.get('services'), c.get('session').user.id)),
  )
  .post('/me/billing/checkout', requireSession, async (c) => {
    const parsed = billingCheckoutRequestSchema.safeParse(
      await readJsonBody(c.req.raw, BILLING_POLICY.requestBytes),
    )
    if (!parsed.success) throw apiErrors.validation('Invalid billing intent.')
    const request = parsed.data
    const services = c.get('services')
    const billing = configured(services)
    const ownerId = c.get('session').user.id
    let organizationId: string | null = null
    if (request.plan === 'pro')
      organizationId = await services.accounts.ensurePrivateWorkspace(ownerId)
    else if ('organizationId' in request) organizationId = request.organizationId
    if (organizationId !== null) {
      if (!(await services.workspaceAccess.isOwner(organizationId, ownerId)))
        throw apiErrors.forbidden()
      const plan = await services.plans.get(organizationId)
      if ((request.plan === 'pro') !== (plan.kind === 'personal')) throw apiErrors.forbidden()
    }
    await billing.gateway.assertAccount('checkout')
    const intent: BillingReservation = {
      id: organizationId ?? request.requestId,
      organizationId,
      ownerId,
      accountId: billing.config.accountId,
      liveMode: billing.config.liveMode,
      plan: request.plan,
      requestId: request.requestId,
      newWorkspaceName: 'newWorkspaceName' in request ? request.newWorkspaceName : null,
      checkoutExpiresAt: new Date(
        Date.now() + BILLING_POLICY.checkoutLifetimeSeconds * BILLING_POLICY.millisecondsPerSecond,
      ),
    }
    const reserved = await billing.store.reserve(intent)
    return await leased(services, reserved.id, ownerId, async (billing, current, token) => {
      const state = await billing.gateway.inspect(current)
      await billing.store.reconcile(current, token, state, new Date())
      let record = await billing.store.get(current.id)
      if (record === null) throw apiErrors.conflict()
      const isSameIntent =
        organizationId === record.organizationId &&
        (organizationId !== null || intent.newWorkspaceName === record.newWorkspaceName)
      if (isSameIntent && state.checkoutUrl !== null && state.checkoutState === 'open')
        return c.json({ url: state.checkoutUrl })
      if (state.chargeable) throw apiErrors.conflict()
      if (organizationId === null && record.organizationId !== null) throw apiErrors.conflict()
      if (record.checkoutSessionId !== null && intent.requestId === record.requestId)
        throw apiErrors.conflict()
      if (
        !isSameIntent ||
        intent.requestId !== record.requestId ||
        record.checkoutExpiresAt.getTime() <= Date.now()
      )
        record = await billing.store.replace(record, token, intent)
      let customerId = record.customerId
      customerId ??= await billing.gateway.createCustomer(record)
      await billing.store.bindCustomer(record, token, customerId)
      record = { ...record, customerId }
      const checkout = await billing.gateway.createCheckout(record, services.config.APP_URL)
      await billing.store.bindCheckout(record, token, checkout.id)
      return c.json({ url: checkout.url })
    })
  })
  .post('/me/billing/portal', requireSession, async (c) => {
    const { services, ownerId, record } = await financialScope(c)
    return await leased(services, record.id, ownerId, async (billing, current) => {
      await billing.gateway.assertAccount('portal')
      return c.json({ url: await billing.gateway.createPortal(current, services.config.APP_URL) })
    })
  })
  .post('/me/billing/reconcile', requireSession, async (c) => {
    const { services, ownerId, record } = await financialScope(c)
    await leased(services, record.id, ownerId, async (billing, current, token) => {
      await billing.gateway.assertAccount('reconcile')
      await billing.store.reconcile(
        current,
        token,
        await billing.gateway.inspect(current),
        new Date(),
      )
    })
    return c.json(await overview(services, ownerId))
  })
  .post('/me/billing/checkout/cancel', requireSession, async (c) => {
    const { services, ownerId, record } = await financialScope(c)
    await leased(services, record.id, ownerId, async (billing, current, token) => {
      await billing.gateway.assertAccount('reconcile')
      await billing.store.reconcile(
        current,
        token,
        await billing.gateway.closeCheckout(current),
        new Date(),
      )
    })
    return c.json(await overview(services, ownerId))
  })
  .post('/billing/stripe/webhook', async (c) => {
    const services = c.get('services')
    const billing = configured(services)
    const signature = c.req.header('stripe-signature')
    if (signature === undefined) throw apiErrors.validation('Missing Stripe signature.')
    const event = await billing.gateway.verifyEvent(await c.req.raw.text(), signature)
    if (!(await billing.store.claimEvent(event, billing.config.accountId)))
      return c.json({ received: true })
    await billing.gateway.assertAccount('reconcile')
    const target = await billing.gateway.eventAuthority(event)
    const saved = target === null ? null : await billing.store.get(target.id)
    if (target === null || saved?.ownerId == null) {
      await billing.store.finishIgnoredEvent(event.id)
      return c.json({ received: true })
    }
    await leased(services, target.id, undefined, async (billing, current, token) => {
      if (!(await billing.store.claimEvent(event, billing.config.accountId))) return
      if (current.requestId !== target.requestId) {
        await billing.store.finishIgnoredEvent(event.id)
        return
      }
      if (
        current.customerId !== target.customerId ||
        (target.checkoutSessionId !== null &&
          current.checkoutSessionId !== null &&
          current.checkoutSessionId !== target.checkoutSessionId) ||
        (current.subscriptionId !== null &&
          target.subscriptionId !== null &&
          current.subscriptionId !== target.subscriptionId)
      )
        throw apiErrors.forbidden()
      await billing.store.reconcile(
        current,
        token,
        await billing.gateway.inspect(current),
        new Date(),
        event.id,
      )
    })
    return c.json({ received: true })
  })
