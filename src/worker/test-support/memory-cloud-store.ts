import type { CloudAttemptRecord, CloudConnectionRecord, CloudStore } from '../cloud-store'

/** Synchronous map changes model each D1 transaction; readers receive detached snapshots. */
const key = (userId: string, provider: string) => JSON.stringify([userId, provider])

export function createMemoryCloudStore(): CloudStore {
  const connections = new Map<string, CloudConnectionRecord>()
  const attempts = new Map<string, CloudAttemptRecord>()
  const reset = (userId: string, provider: CloudConnectionRecord['provider'], now: Date) => {
    const record: CloudConnectionRecord = {
      userId,
      provider,
      status: 'disconnected',
      generation: (connections.get(key(userId, provider))?.generation ?? 0) + 1,
      clientId: null,
      accountLabel: null,
      providerAccountId: null,
      accessCipher: null,
      refreshCipher: null,
      accessExpiresAt: null,
      scopes: '',
      refreshLeaseId: null,
      refreshLeaseExpiresAt: null,
      updatedAt: now,
    }
    connections.set(key(userId, provider), record)
    for (const attempt of attempts.values())
      if (attempt.userId === userId && attempt.provider === provider) {
        attempt.status = 'failed'
        attempt.verifierCipher = ''
      }
    return record
  }
  return {
    list(userId) {
      return Promise.resolve(
        structuredClone(
          connections
            .values()
            .filter((record) => record.userId === userId)
            .toArray(),
        ),
      )
    },
    find(userId, provider) {
      const record = connections.get(key(userId, provider)) ?? null
      return Promise.resolve(structuredClone(record))
    },
    begin(attempt, now) {
      for (const [id, record] of attempts) if (record.expiresAt < now) attempts.delete(id)
      const connection = reset(attempt.userId, attempt.provider, now)
      const record: CloudAttemptRecord = {
        ...attempt,
        status: 'pending',
        generation: connection.generation,
      }
      attempts.set(record.id, record)
      return Promise.resolve(structuredClone(record))
    },
    claim(stateHash, userId, sessionId, provider, now) {
      const record = attempts
        .values()
        .find(
          (attempt) =>
            attempt.stateHash === stateHash &&
            attempt.userId === userId &&
            attempt.sessionId === sessionId &&
            attempt.provider === provider &&
            attempt.status === 'pending' &&
            attempt.expiresAt > now &&
            attempt.generation === connections.get(key(userId, provider))?.generation,
        )
      if (record === undefined) return Promise.resolve(null)
      record.status = 'exchanging'
      return Promise.resolve(structuredClone(record))
    },
    attempt(id, userId, sessionId) {
      const record = attempts.get(id)
      return Promise.resolve(
        record?.userId === userId && record.sessionId === sessionId
          ? structuredClone(record)
          : null,
      )
    },
    complete(attempt, credentials, now) {
      const record = connections.get(key(attempt.userId, attempt.provider))
      const current = attempts.get(attempt.id)
      if (
        record?.generation !== attempt.generation ||
        current?.status !== 'exchanging' ||
        current.sessionId !== attempt.sessionId
      )
        return Promise.resolve(false)
      Object.assign(record, credentials, {
        status: 'connected',
        updatedAt: now,
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      })
      current.status = 'connected'
      current.verifierCipher = ''
      return Promise.resolve(true)
    },
    failAttempt(id, userId, sessionId) {
      const record = attempts.get(id)
      if (record?.userId === userId && record.sessionId === sessionId) {
        record.status = 'failed'
        record.verifierCipher = ''
      }
      return Promise.resolve()
    },
    leaseRefresh(userId, provider, generation, leaseId, now, until) {
      const record = connections.get(key(userId, provider))
      if (
        record?.status !== 'connected' ||
        record.generation !== generation ||
        (record.refreshLeaseId !== null &&
          record.refreshLeaseExpiresAt !== null &&
          record.refreshLeaseExpiresAt >= now)
      )
        return Promise.resolve(false)
      record.refreshLeaseId = leaseId
      record.refreshLeaseExpiresAt = until
      return Promise.resolve(true)
    },
    cancelAttempt(id, userId, sessionId, now) {
      const attempt = attempts.get(id)
      if (attempt?.userId !== userId || attempt.sessionId !== sessionId)
        return Promise.resolve(false)
      attempt.status = 'failed'
      attempt.verifierCipher = ''
      if (connections.get(key(userId, attempt.provider))?.generation === attempt.generation)
        reset(userId, attempt.provider, now)
      return Promise.resolve(true)
    },
    finishRefresh(userId, provider, generation, leaseId, credentials, now) {
      const record = connections.get(key(userId, provider))
      if (record?.generation !== generation || record.refreshLeaseId !== leaseId)
        return Promise.resolve(false)
      Object.assign(record, credentials, {
        updatedAt: now,
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      })
      return Promise.resolve(true)
    },
    releaseRefresh(userId, provider, generation, leaseId, requiresReconnect) {
      const record = connections.get(key(userId, provider))
      if (record?.generation === generation && record.refreshLeaseId === leaseId) {
        record.refreshLeaseId = null
        record.refreshLeaseExpiresAt = null
        if (requiresReconnect) {
          record.status = 'reconnect'
          record.clientId = null
          record.accessCipher = null
          record.refreshCipher = null
          record.accessExpiresAt = null
          record.accountLabel = null
          record.providerAccountId = null
          record.scopes = ''
        }
      }
      return Promise.resolve()
    },
    disconnect(userId, provider, now) {
      const previous = structuredClone(connections.get(key(userId, provider)) ?? null)
      reset(userId, provider, now)
      return Promise.resolve(previous)
    },
  }
}
