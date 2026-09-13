import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'

import type { Database } from './client'
import { cloudAttempt, cloudConnection } from './schema'
import type { CloudStore } from '../cloud-store'

const emptyCredentials = {
  clientId: null,
  providerAccountId: null,
  accountLabel: null,
  accessCipher: null,
  refreshCipher: null,
  accessExpiresAt: null,
  scopes: '',
  refreshLeaseId: null,
  refreshLeaseExpiresAt: null,
} as const

function owner(userId: string, provider: typeof cloudConnection.$inferSelect.provider) {
  return and(eq(cloudConnection.userId, userId), eq(cloudConnection.provider, provider))
}

function leaseOwner(
  userId: string,
  provider: typeof cloudConnection.$inferSelect.provider,
  generation: number,
  leaseId: string,
) {
  return and(
    owner(userId, provider),
    eq(cloudConnection.generation, generation),
    eq(cloudConnection.refreshLeaseId, leaseId),
  )
}

/** D1 transactions fence authorization attempts, token refresh, account replacement, and disconnect. */
export function createDrizzleCloudStore(db: Database): CloudStore {
  return {
    async list(userId) {
      return await db.select().from(cloudConnection).where(eq(cloudConnection.userId, userId))
    },
    async find(userId, provider) {
      const [row] = await db.select().from(cloudConnection).where(owner(userId, provider)).limit(1)
      return row ?? null
    },
    async begin(attempt, now) {
      const statements = [
        db.delete(cloudAttempt).where(lt(cloudAttempt.expiresAt, now)),
        db
          .update(cloudAttempt)
          .set({ status: 'failed', verifierCipher: '' })
          .where(
            and(
              eq(cloudAttempt.userId, attempt.userId),
              eq(cloudAttempt.provider, attempt.provider),
            ),
          ),
        db
          .insert(cloudConnection)
          .values({
            userId: attempt.userId,
            provider: attempt.provider,
            generation: 1,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [cloudConnection.userId, cloudConnection.provider],
            set: {
              ...emptyCredentials,
              status: 'disconnected',
              generation: sql`${cloudConnection.generation} + 1`,
              updatedAt: now,
            },
          }),
        db
          .insert(cloudAttempt)
          .values({
            ...attempt,
            generation: sql`(SELECT generation FROM cloud_connection WHERE user_id = ${attempt.userId} AND provider = ${attempt.provider})`,
            status: 'pending',
          })
          .returning(),
      ] as const
      const results = await db.batch(statements)
      const row = results[3][0]
      if (row === undefined) throw new Error('Cloud authorization attempt was not saved')
      return row
    },
    async claim(stateHash, userId, sessionId, provider, now) {
      const [row] = await db
        .update(cloudAttempt)
        .set({ status: 'exchanging' })
        .where(
          and(
            eq(cloudAttempt.stateHash, stateHash),
            eq(cloudAttempt.userId, userId),
            eq(cloudAttempt.sessionId, sessionId),
            eq(cloudAttempt.provider, provider),
            eq(cloudAttempt.status, 'pending'),
            gt(cloudAttempt.expiresAt, now),
            sql`${cloudAttempt.generation} = (SELECT generation FROM cloud_connection WHERE user_id = ${userId} AND provider = ${provider})`,
          ),
        )
        .returning()
      return row ?? null
    },
    async attempt(id, userId, sessionId) {
      const [row] = await db
        .select()
        .from(cloudAttempt)
        .where(
          and(
            eq(cloudAttempt.id, id),
            eq(cloudAttempt.userId, userId),
            eq(cloudAttempt.sessionId, sessionId),
          ),
        )
        .limit(1)
      return row ?? null
    },
    async complete(attempt, credentials, now) {
      const statements = [
        db
          .update(cloudConnection)
          .set({
            ...credentials,
            status: 'connected',
            refreshLeaseId: null,
            refreshLeaseExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              owner(attempt.userId, attempt.provider),
              eq(cloudConnection.generation, attempt.generation),
              sql`EXISTS (SELECT 1 FROM cloud_attempt WHERE id = ${attempt.id} AND user_id = ${attempt.userId} AND session_id = ${attempt.sessionId} AND provider = ${attempt.provider} AND status = 'exchanging' AND generation = ${attempt.generation})`,
            ),
          )
          .returning({ userId: cloudConnection.userId }),
        db
          .update(cloudAttempt)
          .set({ status: 'connected', verifierCipher: '' })
          .where(and(eq(cloudAttempt.id, attempt.id), sql`changes() > 0`)),
      ] as const
      const results = await db.batch(statements)
      return results[0].length === 1
    },
    async failAttempt(id, userId, sessionId) {
      await db
        .update(cloudAttempt)
        .set({ status: 'failed', verifierCipher: '' })
        .where(
          and(
            eq(cloudAttempt.id, id),
            eq(cloudAttempt.userId, userId),
            eq(cloudAttempt.sessionId, sessionId),
          ),
        )
    },
    async leaseRefresh(userId, provider, generation, leaseId, now, until) {
      const leaseAvailability = or(
        isNull(cloudConnection.refreshLeaseId),
        lt(cloudConnection.refreshLeaseExpiresAt, now),
      )
      const rows = await db
        .update(cloudConnection)
        .set({ refreshLeaseId: leaseId, refreshLeaseExpiresAt: until })
        .where(
          and(
            owner(userId, provider),
            eq(cloudConnection.status, 'connected'),
            eq(cloudConnection.generation, generation),
            leaseAvailability,
          ),
        )
        .returning({ userId: cloudConnection.userId })
      return rows.length === 1
    },
    async cancelAttempt(id, userId, sessionId, now) {
      const attemptScope = and(
        eq(cloudAttempt.id, id),
        eq(cloudAttempt.userId, userId),
        eq(cloudAttempt.sessionId, sessionId),
      )
      const connectionScope = and(
        eq(cloudConnection.userId, userId),
        sql`changes() > 0`,
        sql`EXISTS (SELECT 1 FROM cloud_attempt WHERE id = ${id} AND user_id = ${userId} AND session_id = ${sessionId} AND provider = cloud_connection.provider AND generation = cloud_connection.generation AND status = 'failed')`,
      )
      const statements = [
        db
          .update(cloudAttempt)
          .set({ status: 'failed', verifierCipher: '' })
          .where(attemptScope)
          .returning({ id: cloudAttempt.id }),
        db
          .update(cloudConnection)
          .set({
            ...emptyCredentials,
            status: 'disconnected',
            generation: sql`${cloudConnection.generation} + 1`,
            updatedAt: now,
          })
          .where(connectionScope),
      ] as const
      const result = await db.batch(statements)
      return result[0].length === 1
    },
    async finishRefresh(userId, provider, generation, leaseId, credentials, now) {
      const rows = await db
        .update(cloudConnection)
        .set({ ...credentials, refreshLeaseId: null, refreshLeaseExpiresAt: null, updatedAt: now })
        .where(leaseOwner(userId, provider, generation, leaseId))
        .returning({ userId: cloudConnection.userId })
      return rows.length === 1
    },
    async releaseRefresh(userId, provider, generation, leaseId, requiresReconnect) {
      await db
        .update(cloudConnection)
        .set({
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
          ...(requiresReconnect && { ...emptyCredentials, status: 'reconnect' as const }),
        })
        .where(leaseOwner(userId, provider, generation, leaseId))
    },
    async disconnect(userId, provider, now) {
      const [previous] = await db
        .select()
        .from(cloudConnection)
        .where(owner(userId, provider))
        .limit(1)
      const statements = [
        db
          .insert(cloudConnection)
          .values({ userId, provider, generation: 1, updatedAt: now })
          .onConflictDoUpdate({
            target: [cloudConnection.userId, cloudConnection.provider],
            set: {
              ...emptyCredentials,
              status: 'disconnected',
              generation: sql`${cloudConnection.generation} + 1`,
              updatedAt: now,
            },
          }),
        db
          .update(cloudAttempt)
          .set({ status: 'failed', verifierCipher: '' })
          .where(and(eq(cloudAttempt.userId, userId), eq(cloudAttempt.provider, provider))),
      ] as const
      await db.batch(statements)
      return previous ?? null
    },
  }
}
