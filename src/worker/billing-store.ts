import type { BillingAuthority, BillingEvent, BillingPaidPlan } from '../shared/billing'

/** A tenant is reserved before Checkout; changing a request requires verified provider closure. */
export interface BillingReservation {
  id: string
  organizationId: string | null
  ownerId: string
  accountId: string
  liveMode: boolean
  plan: BillingPaidPlan
  requestId: string
  newWorkspaceName: string | null
  checkoutExpiresAt: Date
}

/** Only current verified provider state may update chargeability or paid capacity. */
export interface BillingSnapshot {
  subscriptionId: string
  subscriptionStatus: string
  paidThrough: Date | null
  suspended: boolean
  cancelAtPeriodEnd: boolean
  invoiceId: string | null
}
export interface BillingProviderState {
  checkoutSessionId: string | null
  checkoutState: BillingAuthority['checkoutState']
  checkoutUrl: string | null
  chargeable: boolean
  snapshot: BillingSnapshot | null
}

/** One authority, receipt ledger and fenced lease are shared by owner recovery and webhooks. */
export interface BillingStore {
  reserve(input: BillingReservation): Promise<BillingAuthority>
  get(id: string): Promise<BillingAuthority | null>
  forOrganization(organizationId: string): Promise<BillingAuthority | null>
  forOwner(ownerId: string, plan: BillingPaidPlan): Promise<BillingAuthority | null>
  bannedChargeable(): Promise<BillingAuthority[]>
  isActivePayer(userId: string): Promise<boolean>
  personal(ownerId: string): Promise<{ organizationId: string; name: string } | null>
  workspace(
    organizationId: string,
    ownerId: string,
  ): Promise<{ organizationId: string; name: string; kind: 'personal' | 'shared' } | null>
  replace(
    authority: BillingAuthority,
    token: string,
    input: BillingReservation,
  ): Promise<BillingAuthority>
  bindCustomer(authority: BillingAuthority, token: string, customerId: string): Promise<void>
  bindCheckout(authority: BillingAuthority, token: string, sessionId: string): Promise<void>
  claimEvent(event: BillingEvent, accountId: string): Promise<boolean>
  finishIgnoredEvent(eventId: string): Promise<void>
  acquire(id: string, token: string, now: Date, ownerId?: string): Promise<boolean>
  release(id: string, token: string): Promise<void>
  reconcile(
    authority: BillingAuthority,
    token: string,
    state: BillingProviderState,
    now: Date,
    eventId?: string,
  ): Promise<void>
}
