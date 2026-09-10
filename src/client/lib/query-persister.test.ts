import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  installQueryPersister,
  isPersistedQuery,
  loadPersistedQueries,
  persistQueries,
} from './query-persister'

const STORAGE_KEY = 'watermark-pro:query-cache'
const SESSION = {
  user: { id: 'u1', name: 'Ada', email: 'ada@example.test', emailVerified: true },
  session: { id: 's1', userId: 'u1', activeOrganizationId: null },
}
const ORG = {
  id: 'org-1',
  name: 'Studio',
  slug: 'studio',
  createdAt: new Date('2026-09-08T00:00:00Z'),
}
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('isPersistedQuery', () => {
  it('matches the shell queries and rejects per-organization data', () => {
    expect(isPersistedQuery(['session'])).toBe(true)
    expect(isPersistedQuery(['organizations'])).toBe(true)
    expect(isPersistedQuery(['organization', 'active'])).toBe(true)
    expect(isPersistedQuery(['organization', 'active', 'role'])).toBe(true)
    expect(isPersistedQuery(['organization', 'org-1', 'audit'])).toBe(false)
    expect(isPersistedQuery(['public-config'])).toBe(false)
  })
})

describe('persist and load', () => {
  it('persists only the shell queries and restores them into a fresh client', () => {
    const source = new QueryClient()
    source.setQueryData(['session'], SESSION)
    source.setQueryData(['organizations'], [ORG])
    source.setQueryData(['organization', 'org-1', 'audit'], ['do not persist'])
    persistQueries(source, localStorage)

    const target = new QueryClient()
    loadPersistedQueries(target, localStorage)
    expect(target.getQueryData(['session'])).toEqual(SESSION)
    expect(target.getQueryData(['organizations'])).toEqual([ORG])
    expect(target.getQueryData(['organization', 'org-1', 'audit'])).toBeUndefined()
  })

  it('retains validated display data older than a day for the live-identity gate', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const source = new QueryClient()
    source.setQueryData(['session'], SESSION)
    persistQueries(source, localStorage)

    vi.setSystemTime(TWO_DAYS_MS)
    const target = new QueryClient()
    loadPersistedQueries(target, localStorage)
    expect(target.getQueryData(['session'])).toEqual(SESSION)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('ignores a corrupt snapshot without throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')
    const target = new QueryClient()
    expect(() => {
      loadPersistedQueries(target, localStorage)
    }).not.toThrow()
    expect(target.getQueryData(['session'])).toBeUndefined()
  })

  it('never stores session credentials or unknown user fields', () => {
    const source = new QueryClient()
    source.setQueryData(['session'], {
      ...SESSION,
      user: { ...SESSION.user, internalNote: 'private-user-canary' },
      session: {
        ...SESSION.session,
        token: 'session-credential-canary',
        ipAddress: 'private-address-canary',
      },
    })
    persistQueries(source, localStorage)
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(raw).not.toContain('canary')
    const restored = new QueryClient()
    loadPersistedQueries(restored, localStorage)
    expect(restored.getQueryData(['session'])).toEqual(SESSION)
  })

  it('persists only the current member and removes invitation and other-member identities', () => {
    const source = new QueryClient()
    source.setQueryData(['session'], {
      ...SESSION,
      session: { ...SESSION.session, activeOrganizationId: ORG.id },
    })
    source.setQueryData(['organization', 'active'], {
      ...ORG,
      members: [
        {
          id: 'm1',
          organizationId: ORG.id,
          userId: SESSION.user.id,
          role: 'owner',
          createdAt: ORG.createdAt,
          user: SESSION.user,
        },
        {
          id: 'm2',
          organizationId: ORG.id,
          userId: 'another-user',
          role: 'viewer',
          createdAt: ORG.createdAt,
          user: {
            id: 'another-user',
            name: 'Private member canary',
            email: 'private-canary@example.test',
          },
        },
      ],
      invitations: [
        {
          id: 'i1',
          organizationId: ORG.id,
          email: 'invitation-canary@example.test',
          role: 'viewer',
          status: 'pending',
          expiresAt: ORG.createdAt,
          inviterId: SESSION.user.id,
        },
      ],
    })
    persistQueries(source, localStorage)
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(raw).not.toContain('canary')
    expect(raw).not.toContain('another-user')
    const restored = new QueryClient()
    loadPersistedQueries(restored, localStorage)
    expect(restored.getQueryData(['organization', 'active'])).toMatchObject({
      members: [{ userId: SESSION.user.id }],
      invitations: [],
    })
  })

  it('rejects a snapshot whose session belongs to a different user', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        at: Date.now(),
        session: { ...SESSION, session: { ...SESSION.session, userId: 'another-user' } },
      }),
    )
    const target = new QueryClient()
    loadPersistedQueries(target, localStorage)
    expect(target.getQueryData(['session'])).toBeUndefined()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('rejects raw dehydrated query graphs and future timestamps', () => {
    for (const value of [
      { at: Date.now(), state: { queries: [] } },
      { version: 2, at: Date.now() + TWO_DAYS_MS, session: SESSION },
    ]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      const restored = new QueryClient()
      loadPersistedQueries(restored, localStorage)
      expect(restored.getQueryData(['session'])).toBeUndefined()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    }
  })
})

describe('installQueryPersister', () => {
  it('clears immediately on sign-out and cannot restore a queued stale write', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    client.setQueryData(['session'], SESSION)
    persistQueries(client, localStorage)
    installQueryPersister(client, localStorage)
    client.setQueryData(['organizations'], [ORG])
    client.clear()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    vi.runAllTimers()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
  it('hydrates on install and writes debounced updates', () => {
    vi.useFakeTimers()
    const source = new QueryClient()
    source.setQueryData(['session'], SESSION)
    persistQueries(source, localStorage)

    const client = new QueryClient()
    installQueryPersister(client, localStorage)
    // Hydrated from the snapshot immediately.
    expect(client.getQueryData(['session'])).toEqual(SESSION)

    // A later change is written after the debounce.
    client.setQueryData(['organizations'], [{ ...ORG, id: 'org-2' }])
    vi.advanceTimersByTime(1000)
    const reloaded = new QueryClient()
    loadPersistedQueries(reloaded, localStorage)
    expect(reloaded.getQueryData(['organizations'])).toEqual([{ ...ORG, id: 'org-2' }])
  })
})
