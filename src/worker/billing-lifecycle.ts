import { APIError } from 'better-auth/api'

import { apiErrors } from './errors'
import type { Services } from './services'
import { UPLOAD_POLICY } from './upload-store'
import { BILLING_POLICY } from '../shared/billing'

/** Deletion/ban closure can operate on a banned payer, but can only remove paid authority. */
export async function closeAccountBilling(
  billing: Services['billing'],
  userId: string,
): Promise<void> {
  for (const plan of ['pro', 'team'] as const) {
    const saved = await billing.store.forOwner(userId, plan)
    if (saved === null) continue
    const token = crypto.randomUUID()
    if (!(await billing.store.acquire(saved.id, token, new Date()))) throw apiErrors.retryLater()
    try {
      const current = await billing.store.get(saved.id)
      if (current?.ownerId !== userId) throw apiErrors.retryLater()
      if (!current.chargeable) continue
      const provider = billing.provider
      if (
        current.accountId !== provider?.config.accountId ||
        current.liveMode !== provider.config.liveMode
      )
        throw apiErrors.retryLater()
      await provider.gateway.assertAccount('reconcile')
      const closed = await provider.gateway.closeAccount(current)
      await billing.store.reconcile(current, token, closed, new Date())
    } finally {
      await billing.store.release(saved.id, token)
    }
  }
}

/** Existing banned + chargeable authority is the retry signal; no second job or payment state exists. */
export async function retryBannedBilling(billing: Services['billing']): Promise<void> {
  const records = await billing.store.bannedChargeable()
  const users = new Set(
    records.flatMap((record) => (record.ownerId === null ? [] : [record.ownerId])),
  )
  for (const userId of users) {
    try {
      await closeAccountBilling(billing, userId)
    } catch {
      /* Chargeability remains locked; the existing scheduled pass retries it. */
    }
  }
}

/** Existing ban fields quiesce new Checkout before auth removes any credential rows. */
export async function prepareBillingDeletion(
  services: Pick<Services, 'billing' | 'auth' | 'uploads'>,
  userId: string,
): Promise<void> {
  const context = await services.auth.$context
  const person = await context.adapter.findOne<{
    banned?: boolean | null
    banReason?: string | null
  }>({
    model: 'user',
    where: [{ field: 'id', value: userId }],
  })
  if (person === null) throw apiErrors.retryLater()
  const marker = `${BILLING_POLICY.deletionMarkerPrefix}${crypto.randomUUID()}`
  const shouldQuiesce = person.banned !== true
  if (shouldQuiesce)
    await context.adapter.update({
      model: 'user',
      where: [
        { field: 'id', value: userId },
        { field: 'banned', value: person.banned ?? null },
      ],
      update: { banned: true, banReason: marker },
    })
  try {
    const locked = await context.adapter.findOne<{ banned?: boolean }>({
      model: 'user',
      where: [{ field: 'id', value: userId }],
    })
    if (locked?.banned !== true) throw apiErrors.retryLater()
    await closeAccountBilling(services.billing, userId)
    try {
      await services.uploads.stagePersonalDeletion(userId)
    } catch {
      throw new APIError('SERVICE_UNAVAILABLE', {
        code: UPLOAD_POLICY.accountCleanupError,
        message:
          'Personal cleanup could not be confirmed. Credentials are retained, but personal content may already be staged for removal. Retry account removal or contact support.',
      })
    }
  } catch (error) {
    // A concurrent moderation ban replaces the marker and must never be undone.
    if (shouldQuiesce)
      await context.adapter.update({
        model: 'user',
        where: [
          { field: 'id', value: userId },
          { field: 'banned', value: true },
          { field: 'banReason', value: marker },
        ],
        update: { banned: false, banReason: person.banReason ?? null },
      })
    throw error
  }
}
