import { env } from 'cloudflare:workers'

import { describe, expect, it } from 'vitest'

import { cloudDigest, decryptCloudValue, encryptCloudValue } from './crypto'
import type { CloudCredentialUpdate } from '../cloud-store'
import { createApp } from '../index'
import { getServices } from '../services'
import { TestClient } from '../test-support/client'

const SECRET = 'fixture-d1-cloud-key-at-least-32-characters'

describe('real D1 cloud connection lifecycle', () => {
  it('enforces atomic claims, account/session isolation, refresh leases, and cancellation after provider completion', async () => {
    const services = getServices(env)
    const mailbox = services.devMailbox
    if (mailbox === undefined) throw new Error('Test mailbox required')
    const client = new TestClient(createApp(), env)
    await client.signUpAndVerify(mailbox, {
      name: 'D1 Cloud',
      email: 'cloud-d1@example.test',
      password: 'correct horse battery',
    })
    const session = await services.auth.api.getSession({
      headers: new Headers({ cookie: client.cookieHeader }),
    })
    if (session === null) throw new Error('Expected authenticated fixture')
    const userId = session.user.id
    const sessionId = session.session.id
    const now = new Date()
    const attemptId = crypto.randomUUID()
    const stateHash = await cloudDigest('fixture-opaque-state')
    const attempt = await services.cloud.begin(
      {
        id: attemptId,
        userId,
        sessionId,
        provider: 'google',
        stateHash,
        verifierCipher: await encryptCloudValue(
          SECRET,
          userId,
          'google',
          attemptId,
          'fixture-verifier',
        ),
        expiresAt: new Date(now.getTime() + 60_000),
      },
      now,
    )
    expect(
      await services.cloud.claim(stateHash, 'foreign-user', sessionId, 'google', now),
    ).toBeNull()
    expect(
      await services.cloud.claim(stateHash, userId, 'foreign-session', 'google', now),
    ).toBeNull()
    expect(await services.cloud.claim(stateHash, userId, sessionId, 'dropbox', now)).toBeNull()
    const claims = await Promise.all([
      services.cloud.claim(stateHash, userId, sessionId, 'google', now),
      services.cloud.claim(stateHash, userId, sessionId, 'google', now),
    ])
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1)
    const credentials: CloudCredentialUpdate = {
      clientId: 'fixture-client',
      providerAccountId: 'provider-owner',
      accountLabel: 'Cloud Owner',
      scopes: 'files',
      accessCipher: await encryptCloudValue(SECRET, userId, 'google', 'access', 'fixture-access'),
      refreshCipher: await encryptCloudValue(
        SECRET,
        userId,
        'google',
        'refresh',
        'fixture-refresh',
      ),
      accessExpiresAt: new Date(now.getTime() + 60_000),
    }
    expect(await services.cloud.complete(attempt, credentials, now)).toBe(true)
    expect(await services.cloud.complete(attempt, credentials, now)).toBe(false)
    const saved = await services.cloud.find(userId, 'google')
    expect(saved?.status).toBe('connected')
    if (saved?.refreshCipher === null || saved?.refreshCipher === undefined)
      throw new Error('Expected encrypted refresh token')
    expect(saved.refreshCipher).not.toContain('fixture-refresh')
    expect(await decryptCloudValue(SECRET, userId, 'google', 'refresh', saved.refreshCipher)).toBe(
      'fixture-refresh',
    )
    expect(await services.cloud.find('foreign-user', 'google')).toBeNull()
    expect(await services.cloud.attempt(attemptId, userId, 'foreign-session')).toBeNull()
    const leaseExpiresAt = new Date(now.getTime() + 30_000)
    const leases = await Promise.all([
      services.cloud.leaseRefresh(
        userId,
        'google',
        attempt.generation,
        'lease-a',
        now,
        leaseExpiresAt,
      ),
      services.cloud.leaseRefresh(
        userId,
        'google',
        attempt.generation,
        'lease-b',
        now,
        leaseExpiresAt,
      ),
    ])
    expect(leases.filter(Boolean)).toHaveLength(1)
    const lease = leases[0] ? 'lease-a' : 'lease-b'
    expect(await services.cloud.cancelAttempt(attemptId, userId, 'foreign-session', now)).toBe(
      false,
    )
    expect(await services.cloud.cancelAttempt(attemptId, userId, sessionId, now)).toBe(true)
    expect(
      await services.cloud.finishRefresh(
        userId,
        'google',
        attempt.generation,
        lease,
        credentials,
        now,
      ),
    ).toBe(false)
    expect(await services.cloud.find(userId, 'google')).toMatchObject({
      status: 'disconnected',
      accessCipher: null,
      refreshCipher: null,
    })
    expect(await services.cloud.claim(stateHash, userId, sessionId, 'google', now)).toBeNull()
  })

  it('keeps a newer connection when an older popup is cancelled and rejects stale/expired callbacks', async () => {
    const services = getServices(env)
    const mailbox = services.devMailbox
    if (mailbox === undefined) throw new Error('Test mailbox required')
    const client = new TestClient(createApp(), env)
    await client.signUpAndVerify(mailbox, {
      name: 'D1 Replacement',
      email: 'replace-cloud-d1@example.test',
      password: 'correct horse battery',
    })
    const session = await services.auth.api.getSession({
      headers: new Headers({ cookie: client.cookieHeader }),
    })
    if (session === null) throw new Error('Expected session')
    const userId = session.user.id
    const sessionId = session.session.id
    const now = new Date()
    const common = {
      userId,
      sessionId,
      provider: 'dropbox' as const,
      verifierCipher: 'encrypted-fixture',
      expiresAt: new Date(now.getTime() + 60_000),
    }
    const first = await services.cloud.begin(
      { ...common, id: crypto.randomUUID(), stateHash: 'first-state' },
      now,
    )
    const newer = await services.cloud.begin(
      { ...common, id: crypto.randomUUID(), stateHash: 'next-state' },
      now,
    )
    expect(await services.cloud.claim('first-state', userId, sessionId, 'dropbox', now)).toBeNull()
    expect(await services.cloud.cancelAttempt(first.id, userId, sessionId, now)).toBe(true)
    const latest = await services.cloud.find(userId, 'dropbox')
    expect(latest?.generation).toBe(newer.generation)
    const afterExpiry = new Date(now.getTime() + 60_001)
    expect(
      await services.cloud.claim('next-state', userId, sessionId, 'dropbox', afterExpiry),
    ).toBeNull()
    expect(
      await services.cloud.claim('next-state', userId, sessionId, 'dropbox', now),
    ).not.toBeNull()
  })
})
