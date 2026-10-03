import { z } from 'zod'

import { BILLING_POLICY, billingAuthoritySchema, type BillingAuthority } from '../../shared/billing'
import type { BillingStore } from '../billing-store'
import { apiErrors } from '../errors'

const COLUMNS = `id, organization_id AS organizationId, owner_id AS ownerId,
  account_id AS accountId, live_mode AS liveMode, plan, request_id AS requestId,
  new_workspace_name AS newWorkspaceName, customer_id AS customerId,
  checkout_session_id AS checkoutSessionId, checkout_expires_at AS checkoutExpiresAt,
  checkout_state AS checkoutState, chargeable, subscription_id AS subscriptionId,
  subscription_status AS subscriptionStatus, paid_through AS paidThrough, suspended,
  cancel_at_period_end AS cancelAtPeriodEnd, invoice_id AS invoiceId, revision`
const FENCE = `id = ? AND request_id = ? AND lease_token = ? AND lease_until > ?
  AND EXISTS (SELECT 1 FROM user WHERE user.id = billing_workspace.owner_id)`
const workspaceSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  kind: z.enum(['personal', 'shared']),
})
function authority(raw: Record<string, unknown> | null): BillingAuthority | null {
  if (raw === null) return null
  return billingAuthoritySchema.parse({
    ...raw,
    liveMode: raw['liveMode'] === 1,
    chargeable: raw['chargeable'] === 1,
    suspended: raw['suspended'] === 1,
    cancelAtPeriodEnd: raw['cancelAtPeriodEnd'] === 1,
    checkoutExpiresAt: new Date(Number(raw['checkoutExpiresAt'])),
    paidThrough: raw['paidThrough'] === null ? null : new Date(Number(raw['paidThrough'])),
  })
}

/** Each commit fences the request generation as well as the lease; local expiry cannot release billing. */
export function createD1BillingStore(db: D1Database): BillingStore {
  const store: BillingStore = {
    async reserve(input) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO billing_workspace
        (id, organization_id, owner_id, account_id, live_mode, plan, request_id, new_workspace_name, checkout_expires_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user u
          WHERE u.id = ? AND u.email_verified = 1 AND COALESCE(u.banned, 0) = 0
            AND u.membership_cohort IN ('private', 'public'))
        AND (? IS NULL OR EXISTS (SELECT 1 FROM member m WHERE m.organization_id = ? AND m.user_id = ? AND m.role = 'owner'))`,
        )
        .bind(
          input.id,
          input.organizationId,
          input.ownerId,
          input.accountId,
          Number(input.liveMode),
          input.plan,
          input.requestId,
          input.newWorkspaceName,
          input.checkoutExpiresAt.getTime(),
          input.ownerId,
          input.organizationId,
          input.organizationId,
          input.ownerId,
        )
        .run()
      const saved =
        input.organizationId === null
          ? await store.forOwner(input.ownerId, 'team')
          : await store.forOrganization(input.organizationId)
      if (
        saved?.ownerId !== input.ownerId ||
        saved.plan !== input.plan ||
        saved.accountId !== input.accountId ||
        saved.liveMode !== input.liveMode
      )
        throw apiErrors.conflict()
      return saved
    },
    async get(id) {
      return authority(
        await db.prepare(`SELECT ${COLUMNS} FROM billing_workspace WHERE id = ?`).bind(id).first(),
      )
    },
    async forOrganization(id) {
      return authority(
        await db
          .prepare(`SELECT ${COLUMNS} FROM billing_workspace WHERE organization_id = ?`)
          .bind(id)
          .first(),
      )
    },
    async forOwner(ownerId, plan) {
      return authority(
        await db
          .prepare(`SELECT ${COLUMNS} FROM billing_workspace WHERE owner_id = ? AND plan = ?`)
          .bind(ownerId, plan)
          .first(),
      )
    },
    async bannedChargeable() {
      const result = await db
        .prepare(
          `SELECT ${COLUMNS} FROM billing_workspace
        WHERE chargeable = 1 AND owner_id IN (SELECT id FROM user WHERE banned = 1)
        ORDER BY id LIMIT 100`,
        )
        .all()
      return result.results.map((row) => {
        const parsed = authority(row)
        if (parsed === null) throw apiErrors.retryLater()
        return parsed
      })
    },
    async isActivePayer(userId) {
      const person = await db
        .prepare(
          `SELECT id FROM user WHERE id = ? AND email_verified = 1
        AND COALESCE(banned, 0) = 0 AND membership_cohort IN ('private', 'public')`,
        )
        .bind(userId)
        .first('id')
      return person !== null
    },
    async personal(ownerId) {
      return await db
        .prepare(
          `SELECT o.id AS organizationId, o.name FROM private_workspace p JOIN organization o ON o.id = p.organization_id
        JOIN member m ON m.organization_id = o.id WHERE p.user_id = ? AND m.user_id = ? AND m.role = 'owner'`,
        )
        .bind(ownerId, ownerId)
        .first<{ organizationId: string; name: string }>()
    },
    async workspace(id, ownerId) {
      const row = await db
        .prepare(
          `SELECT o.id AS organizationId, o.name, p.kind FROM organization o JOIN workspace_plan p ON p.organization_id = o.id
        JOIN member m ON m.organization_id = o.id WHERE o.id = ? AND m.user_id = ? AND m.role = 'owner'`,
        )
        .bind(id, ownerId)
        .first()
      return row === null ? null : workspaceSchema.parse(row)
    },
    async replace(saved, token, input) {
      const result = await db
        .prepare(
          `UPDATE billing_workspace SET request_id = ?, new_workspace_name = ?,
        checkout_session_id = NULL, checkout_state = 'none', checkout_expires_at = ?, chargeable = 1,
        subscription_id = NULL, subscription_status = 'none', paid_through = NULL, suspended = 1,
        invoice_id = NULL, cancel_at_period_end = 0 WHERE ${FENCE} AND chargeable = 0`,
        )
        .bind(
          input.requestId,
          saved.organizationId === null ? input.newWorkspaceName : saved.newWorkspaceName,
          input.checkoutExpiresAt.getTime(),
          saved.id,
          saved.requestId,
          token,
          Date.now(),
        )
        .run()
      if (result.meta.changes !== 1) throw apiErrors.conflict()
      const current = await store.get(saved.id)
      if (current === null) throw apiErrors.conflict()
      return current
    },
    async bindCustomer(saved, token, customerId) {
      const result = await db
        .prepare(
          `UPDATE billing_workspace SET customer_id = ?, chargeable = 1 WHERE ${FENCE}
        AND owner_id IN (SELECT id FROM user WHERE COALESCE(banned, 0) = 0 AND email_verified = 1 AND membership_cohort IN ('private', 'public'))
        AND (customer_id IS NULL OR customer_id = ?)`,
        )
        .bind(customerId, saved.id, saved.requestId, token, Date.now(), customerId)
        .run()
      if (result.meta.changes !== 1) throw apiErrors.retryLater()
    },
    async bindCheckout(saved, token, sessionId) {
      const result = await db
        .prepare(
          `UPDATE billing_workspace SET checkout_session_id = ?, checkout_state = 'open', chargeable = 1
        WHERE ${FENCE} AND owner_id IN (SELECT id FROM user WHERE COALESCE(banned, 0) = 0 AND email_verified = 1 AND membership_cohort IN ('private', 'public'))
          AND (checkout_session_id IS NULL OR checkout_session_id = ?)`,
        )
        .bind(sessionId, saved.id, saved.requestId, token, Date.now(), sessionId)
        .run()
      if (result.meta.changes !== 1) throw apiErrors.retryLater()
    },
    async claimEvent(event, accountId) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO billing_event
        (id, account_id, live_mode, event_type, object_id, provider_created, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          event.id,
          accountId,
          Number(event.livemode),
          event.type,
          event.data.object.id,
          event.created,
          Date.now(),
        )
        .run()
      const receipt = await db
        .prepare(
          `SELECT account_id AS accountId, live_mode AS liveMode, event_type AS eventType,
        object_id AS objectId, completed_at AS completedAt FROM billing_event WHERE id = ?`,
        )
        .bind(event.id)
        .first<{
          accountId: string
          liveMode: number
          eventType: string
          objectId: string
          completedAt: number | null
        }>()
      if (
        receipt?.accountId !== accountId ||
        receipt.liveMode !== Number(event.livemode) ||
        receipt.eventType !== event.type ||
        receipt.objectId !== event.data.object.id
      )
        throw apiErrors.forbidden()
      return receipt.completedAt === null
    },
    async finishIgnoredEvent(id) {
      await db
        .prepare(
          "UPDATE billing_event SET completed_at = ?, outcome = 'ignored' WHERE id = ? AND completed_at IS NULL",
        )
        .bind(Date.now(), id)
        .run()
    },
    async acquire(id, token, now, ownerId) {
      const result = await db
        .prepare(
          `UPDATE billing_workspace SET lease_token = ?, lease_until = ?
        WHERE id = ? AND EXISTS (SELECT 1 FROM user WHERE user.id = billing_workspace.owner_id)
        AND (lease_token IS NULL OR lease_until <= ?)
        AND (? IS NULL OR (owner_id = ? AND EXISTS (SELECT 1 FROM user u WHERE u.id = owner_id
          AND u.email_verified = 1 AND COALESCE(u.banned, 0) = 0 AND u.membership_cohort IN ('private', 'public'))
          AND (organization_id IS NULL OR EXISTS (SELECT 1 FROM member m
            WHERE m.organization_id = billing_workspace.organization_id AND m.user_id = billing_workspace.owner_id AND m.role = 'owner'))))`,
        )
        .bind(
          token,
          now.getTime() + BILLING_POLICY.leaseMs,
          id,
          now.getTime(),
          ownerId ?? null,
          ownerId ?? null,
        )
        .run()
      return result.meta.changes === 1
    },
    async release(id, token) {
      await db
        .prepare(
          'UPDATE billing_workspace SET lease_token = NULL, lease_until = NULL WHERE id = ? AND lease_token = ?',
        )
        .bind(id, token)
        .run()
    },
    async reconcile(saved, token, state, now, eventId) {
      const millis = now.getTime()
      const snapshot = state.snapshot
      const paidThrough = snapshot?.paidThrough?.getTime() ?? null
      const isSuspended = snapshot?.suspended ?? true
      const subscriptionId = snapshot?.subscriptionId ?? null
      const fence = [saved.id, saved.requestId, token, millis, eventId ?? null, eventId ?? null]
      const commitFence = `${FENCE} AND (? IS NULL OR EXISTS (SELECT 1 FROM billing_event WHERE id = ? AND completed_at IS NULL))`
      const statements = [
        db
          .prepare(
            `UPDATE billing_workspace SET checkout_session_id = ?, checkout_state = ?, chargeable = ?,
          subscription_id = ?, subscription_status = ?,
          paid_through = CASE WHEN EXISTS (SELECT 1 FROM user WHERE id = owner_id AND banned = 1) THEN NULL ELSE ? END,
          suspended = CASE WHEN EXISTS (SELECT 1 FROM user WHERE id = owner_id AND banned = 1) THEN 1 ELSE ? END,
          cancel_at_period_end = ?, invoice_id = ?, revision = revision + 1
          WHERE ${commitFence}`,
          )
          .bind(
            state.checkoutSessionId,
            state.checkoutState,
            Number(state.chargeable),
            subscriptionId,
            snapshot?.subscriptionStatus ?? 'none',
            paidThrough,
            Number(isSuspended),
            Number(snapshot?.cancelAtPeriodEnd ?? false),
            snapshot?.invoiceId ?? null,
            ...fence,
          ),
        db
          .prepare(
            `INSERT INTO organization (id, name, slug, created_at, creation_owner_id, creation_kind)
          SELECT id, new_workspace_name, 'team-' || id, ?, owner_id, 'paid' FROM billing_workspace WHERE ${commitFence}
          AND organization_id IS NULL AND plan = 'team' AND suspended = 0 AND paid_through > ?
          AND NOT EXISTS (SELECT 1 FROM organization WHERE id = ?)`,
          )
          .bind(millis, ...fence, millis, saved.id),
        db
          .prepare(
            `INSERT INTO member (id, organization_id, user_id, role, created_at)
          SELECT 'billing-owner-' || id, id, owner_id, 'owner', ? FROM billing_workspace WHERE ${commitFence}
          AND organization_id IS NULL AND EXISTS (SELECT 1 FROM organization WHERE id = ?)
          AND NOT EXISTS (SELECT 1 FROM member WHERE organization_id = ? AND user_id = owner_id)`,
          )
          .bind(millis, ...fence, saved.id, saved.id),
        db
          .prepare(
            `UPDATE billing_workspace SET organization_id = id WHERE ${commitFence}
          AND organization_id IS NULL AND EXISTS (SELECT 1 FROM organization WHERE id = ?)`,
          )
          .bind(...fence, saved.id),
        db
          .prepare(
            `UPDATE workspace_plan SET paid_plan = ?,
          paid_through = (SELECT paid_through FROM billing_workspace WHERE ${commitFence}),
          paid_access_suspended = (SELECT suspended FROM billing_workspace WHERE ${commitFence}), revision = revision + 1
          WHERE organization_id = (SELECT organization_id FROM billing_workspace WHERE ${commitFence})`,
          )
          .bind(saved.plan, ...fence, ...fence, ...fence),
      ]
      if (eventId !== undefined)
        statements.push(
          db
            .prepare(
              `UPDATE billing_event SET completed_at = ?, outcome = 'reconciled',
        authority_id = ?, subscription_id = ?, invoice_id = ? WHERE id = ? AND completed_at IS NULL
        AND EXISTS (SELECT 1 FROM billing_workspace WHERE ${commitFence})`,
            )
            .bind(millis, saved.id, subscriptionId, snapshot?.invoiceId ?? null, eventId, ...fence),
        )
      const results = await db.batch(statements)
      if (
        results[0]?.meta.changes !== 1 ||
        (eventId !== undefined && results.at(-1)?.meta.changes !== 1)
      )
        throw apiErrors.retryLater()
    },
  }
  return store
}
