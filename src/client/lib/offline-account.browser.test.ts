/** Private account boundaries exercise the real browser store, query cache, and cross-tab event path. */
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activateOfflineAccount,
  clearOfflineAccount,
  installOfflineAccountBoundary,
  lockOfflineAccount,
} from './offline-account'
import { captureOfflineOwner, currentOfflineUser, setOfflineUser } from './offline-context'
import type * as OfflineDatabase from './offline-database'
import {
  cacheOfflineRecord,
  clearOfflineDatabase,
  clearOfflineAccountData,
  commitOfflineChange,
  offlineOperations,
  pendingOperations,
  rememberOfflineAccount,
  offlineRecordKey,
  readOfflineRecord,
} from './offline-database'
import {
  OFFLINE_ORG,
  OFFLINE_USER,
  offlineOperation,
  offlinePreset,
} from '../test-support/offline-fixtures'

const delayedCleanup = vi.hoisted(() => ({
  wait: null as Promise<void> | null,
  started: false,
}))
vi.mock('./offline-database', async (importOriginal) => {
  const original = await importOriginal<typeof OfflineDatabase>()
  return {
    ...original,
    async clearOfflineAccountData(userId: string) {
      delayedCleanup.started = true
      await delayedCleanup.wait
      return await original.clearOfflineAccountData(userId)
    },
  }
})

beforeEach(async () => {
  delayedCleanup.wait = null
  delayedCleanup.started = false
  await clearOfflineDatabase()
  localStorage.clear()
  setOfflineUser(null)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const OTHER_USER = 'another-account'
const CACHE_KEY = offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, 'private')

async function cachePrivateRecord() {
  await cacheOfflineRecord({
    key: CACHE_KEY,
    userId: OFFLINE_USER,
    organizationId: OFFLINE_ORG,
    value: 'private canary',
  })
}

describe('account isolation', () => {
  it('clears old queries and durable cached content before admitting a different account', async () => {
    const client = new QueryClient()
    setOfflineUser(OFFLINE_USER)
    client.setQueryData(['organization', OFFLINE_ORG, 'library'], 'private canary')
    await cachePrivateRecord()
    const owner = captureOfflineOwner()
    await activateOfflineAccount(client, OTHER_USER)
    expect(currentOfflineUser()).toBe(OTHER_USER)
    expect(client.getQueryCache().getAll()).toEqual([])
    expect(await readOfflineRecord(CACHE_KEY)).toBeNull()
    expect(owner.assertCurrent).toThrow('account changed')
  })

  it('retains pending work through expiry and rejects switching without exposing or discarding it', async () => {
    const client = new QueryClient()
    setOfflineUser(OFFLINE_USER)
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
    client.setQueryData(['session'], { private: 'canary' })
    lockOfflineAccount(client)
    expect(currentOfflineUser()).toBeNull()
    expect(client.getQueryCache().getAll()).toEqual([])
    await expect(activateOfflineAccount(client, OTHER_USER)).rejects.toThrow('original account')
    expect(currentOfflineUser()).toBeNull()
    expect(await offlineOperations(OFFLINE_USER)).toHaveLength(1)
    await activateOfflineAccount(client, OFFLINE_USER)
    expect(currentOfflineUser()).toBe(OFFLINE_USER)
    expect(await offlineOperations(OFFLINE_USER)).toHaveLength(1)
  })

  it('keeps same-account cached queries and pending work when reopening', async () => {
    const client = new QueryClient()
    setOfflineUser(OFFLINE_USER)
    client.setQueryData(['session'], { owner: OFFLINE_USER })
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
    await activateOfflineAccount(client, OFFLINE_USER)
    expect(client.getQueryData(['session'])).toEqual({ owner: OFFLINE_USER })
    expect(await offlineOperations(OFFLINE_USER)).toHaveLength(1)
  })

  it('removes all local data after a completed explicit sign-out', async () => {
    const client = new QueryClient()
    setOfflineUser(OFFLINE_USER)
    await cachePrivateRecord()
    await clearOfflineAccount(client, OFFLINE_USER)
    expect(currentOfflineUser()).toBeNull()
    expect(await readOfflineRecord(CACHE_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem('lumafoil:active-account') ?? '{}')).toMatchObject({
      userId: null,
    })
  })

  it('invalidates stale results even if the original account signs in again', () => {
    setOfflineUser(OFFLINE_USER)
    const captured = captureOfflineOwner()
    setOfflineUser(OTHER_USER)
    setOfflineUser(OFFLINE_USER)
    expect(captured.assertCurrent).toThrow('account changed')
    expect(captureOfflineOwner().assertCurrent).not.toThrow()
  })

  it('locks the old tab on a different account event, ignores malformed/same-account events, and disposes', async () => {
    const client = new QueryClient()
    setOfflineUser(OFFLINE_USER)
    await cachePrivateRecord()
    const changed = vi.fn()
    const dispose = installOfflineAccountBoundary(client, changed)
    const send = (key: string, value: unknown) => {
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(value) }))
    }
    send('another-key', { userId: OTHER_USER })
    send('lumafoil:active-account', { userId: OFFLINE_USER })
    send('lumafoil:active-account', { userId: 3 })
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'lumafoil:active-account', newValue: '{' }),
    )
    expect(changed).not.toHaveBeenCalled()
    client.setQueryData(['organization', OFFLINE_ORG], 'private canary')
    send('lumafoil:active-account', { userId: OTHER_USER })
    expect(changed).toHaveBeenCalledOnce()
    expect(client.getQueryCache().getAll()).toEqual([])
    expect(currentOfflineUser()).toBeNull()
    // The receiving tab must not wipe data while the new tab is opening its own account.
    expect(await readOfflineRecord(CACHE_KEY)).not.toBeNull()
    dispose()
    setOfflineUser(OFFLINE_USER)
    send('lumafoil:active-account', { userId: OTHER_USER })
    expect(changed).toHaveBeenCalledOnce()
  })
})

it('account-scoped cleanup preserves another owner and their active marker', async () => {
  await cachePrivateRecord()
  const otherKey = offlineRecordKey(OTHER_USER, OFFLINE_ORG, 'private')
  await cacheOfflineRecord({
    key: otherKey,
    userId: OTHER_USER,
    organizationId: OFFLINE_ORG,
    value: 'other account canary',
  })
  await clearOfflineAccountData(OFFLINE_USER)
  expect(await readOfflineRecord(CACHE_KEY)).toBeNull()
  expect(await readOfflineRecord(otherKey)).toMatchObject({
    userId: OTHER_USER,
    value: 'other account canary',
  })
})

it('a delayed old sign-out response cannot lock or erase an already active different account', async () => {
  const client = new QueryClient()
  setOfflineUser(OTHER_USER)
  client.setQueryData(['session'], { userId: OTHER_USER })
  const key = offlineRecordKey(OTHER_USER, OFFLINE_ORG, 'private')
  await cacheOfflineRecord({
    key,
    userId: OTHER_USER,
    organizationId: OFFLINE_ORG,
    value: 'new session canary',
  })
  await expect(clearOfflineAccount(client, OFFLINE_USER)).rejects.toThrow('account changed')
  expect(currentOfflineUser()).toBe(OTHER_USER)
  expect(client.getQueryData(['session'])).toEqual({ userId: OTHER_USER })
  expect(await readOfflineRecord(key)).toMatchObject({ value: 'new session canary' })
})

it.each([OFFLINE_USER, OTHER_USER])(
  'a new %s login waits for delayed previous-account cleanup before saving',
  async (userId) => {
    const client = new QueryClient()
    setOfflineUser(OFFLINE_USER)
    await cachePrivateRecord()
    const gate = Promise.withResolvers<undefined>()
    delayedCleanup.wait = gate.promise
    const exiting = clearOfflineAccount(client, OFFLINE_USER)
    await vi.waitFor(() => expect(delayedCleanup.started).toBe(true))
    // Prove the same-window queue independently of the optional cross-tab Web Lock.
    vi.stubGlobal('navigator', { onLine: true })
    let hasActivated = false
    const key = offlineRecordKey(userId, OFFLINE_ORG, 'fresh')
    const entering = (async () => {
      await activateOfflineAccount(client, userId)
      hasActivated = true
      await cacheOfflineRecord({
        key,
        userId,
        organizationId: OFFLINE_ORG,
        value: 'fresh save canary',
      })
    })()
    const OBSERVATION_MS = 100
    try {
      await Promise.race([entering, new Promise((resolve) => setTimeout(resolve, OBSERVATION_MS))])
      expect(hasActivated).toBe(false)
      expect(currentOfflineUser()).toBeNull()
    } finally {
      gate.resolve(undefined)
      await Promise.all([exiting, entering])
    }
    expect(currentOfflineUser()).toBe(userId)
    expect(await readOfflineRecord(key)).toMatchObject({ value: 'fresh save canary', userId })
    expect(await readOfflineRecord(CACHE_KEY)).toBeNull()
  },
)

it('preserves a same-account save queued while the logout response was pending', async () => {
  const client = new QueryClient()
  setOfflineUser(OFFLINE_USER)
  await rememberOfflineAccount(OFFLINE_USER)
  await cachePrivateRecord()
  expect(await pendingOperations(OFFLINE_USER)).toEqual([])
  // Another tab commits after the UI check, before the server response reaches cleanup.
  await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
  await clearOfflineAccount(client, OFFLINE_USER)
  expect(currentOfflineUser()).toBeNull()
  expect(await pendingOperations(OFFLINE_USER)).toHaveLength(1)
  expect(await readOfflineRecord(CACHE_KEY)).not.toBeNull()
  expect(await readOfflineRecord('active-account')).toBeNull()
  await expect(activateOfflineAccount(client, OTHER_USER)).rejects.toThrow('original account')
  await activateOfflineAccount(client, OFFLINE_USER)
  expect(await pendingOperations(OFFLINE_USER)).toHaveLength(1)
})
