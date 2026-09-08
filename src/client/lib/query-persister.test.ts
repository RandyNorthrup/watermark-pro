import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  installQueryPersister,
  isPersistedQuery,
  loadPersistedQueries,
  persistQueries,
} from './query-persister'

const STORAGE_KEY = 'watermark-pro:query-cache'
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
    source.setQueryData(['session'], { user: { id: 'u1' } })
    source.setQueryData(['organizations'], [{ id: 'org-1' }])
    source.setQueryData(['organization', 'org-1', 'audit'], ['do not persist'])
    persistQueries(source, localStorage)

    const target = new QueryClient()
    loadPersistedQueries(target, localStorage)
    expect(target.getQueryData(['session'])).toEqual({ user: { id: 'u1' } })
    expect(target.getQueryData(['organizations'])).toEqual([{ id: 'org-1' }])
    expect(target.getQueryData(['organization', 'org-1', 'audit'])).toBeUndefined()
  })

  it('discards and removes a snapshot older than a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const source = new QueryClient()
    source.setQueryData(['session'], { user: { id: 'u1' } })
    persistQueries(source, localStorage)

    vi.setSystemTime(TWO_DAYS_MS)
    const target = new QueryClient()
    loadPersistedQueries(target, localStorage)
    expect(target.getQueryData(['session'])).toBeUndefined()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ignores a corrupt snapshot without throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')
    const target = new QueryClient()
    expect(() => {
      loadPersistedQueries(target, localStorage)
    }).not.toThrow()
    expect(target.getQueryData(['session'])).toBeUndefined()
  })
})

describe('installQueryPersister', () => {
  it('hydrates on install and writes debounced updates', () => {
    vi.useFakeTimers()
    const source = new QueryClient()
    source.setQueryData(['session'], { user: { id: 'u1' } })
    persistQueries(source, localStorage)

    const client = new QueryClient()
    installQueryPersister(client, localStorage)
    // Hydrated from the snapshot immediately.
    expect(client.getQueryData(['session'])).toEqual({ user: { id: 'u1' } })

    // A later change is written after the debounce.
    client.setQueryData(['organizations'], [{ id: 'org-2' }])
    vi.advanceTimersByTime(1000)
    const reloaded = new QueryClient()
    loadPersistedQueries(reloaded, localStorage)
    expect(reloaded.getQueryData(['organizations'])).toEqual([{ id: 'org-2' }])
  })
})
