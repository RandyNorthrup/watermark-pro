import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setOfflineUser } from './offline-context'
import {
  cacheOfflineRecord,
  clearOfflineDatabase,
  commitOfflineChange,
  offlineRecordKey,
  readOfflineRecord,
  updateOfflineRecord,
} from './offline-database'
import {
  changeRecentView,
  recordRecentWork,
  recentViewQueryOptions,
  recentWorkQueryOptions,
} from './recent-work'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import { recentActivitySchema, type RecentWorkItem } from '../../shared/recent-work'
import { localRecentActivitySchema } from '../../shared/recent-work'
import {
  OFFLINE_ORG,
  OFFLINE_USER,
  offlineOperation,
  offlinePhoto,
  offlinePreset,
} from '../test-support/offline-fixtures'

beforeEach(async () => {
  await clearOfflineDatabase()
  setOfflineUser(OFFLINE_USER)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function recentItems() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    return await client.query(recentWorkQueryOptions(OFFLINE_ORG))
  } finally {
    client.clear()
  }
}

async function viewPreference() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    return await client.query(recentViewQueryOptions())
  } finally {
    client.clear()
  }
}

describe('offline recent activity', () => {
  it('replays pending activity on reconnect with the original account binding and actual used-at date', async () => {
    const preset = offlinePreset('Offline recent mark')
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset })
    const before = await readOfflineRecord(
      offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, 'recent-work'),
    )
    const captured = localRecentActivitySchema.parse(before?.value).items[0]
    const serverItems: RecentWorkItem[] = []
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      expect(new Headers(init?.headers).get(ACCOUNT_ID_HEADER)).toBe(OFFLINE_USER)
      if (init?.method === 'POST') {
        const event = recentActivitySchema.parse(
          JSON.parse(typeof init.body === 'string' ? init.body : '{}'),
        )
        serverItems.push({ kind: 'preset', preset, usedAt: event.usedAt })
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      return Promise.resolve(Response.json({ items: serverItems }))
    })
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const result = await recentItems()
    expect(result.items[0]?.usedAt).toBe(captured?.usedAt)
    expect(result.pendingKeys).toEqual([])
    expect(fetcher.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
  })

  it('hides locally deleted work before reconnect and never falls back after an authoritative denial', async () => {
    const preset = offlinePreset()
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset })
    await commitOfflineChange(offlineOperation({ kind: 'preset-delete', presetId: preset.id }))
    const deleted = await recentItems()
    expect(deleted.items).toEqual([])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 }))),
    )
    await expect(recentItems()).rejects.toThrow('Your role does not allow this')
  })
  it('keeps simultaneous distinct opens in one atomic IndexedDB record', async () => {
    const preset = offlinePreset()
    const photo = offlinePhoto()
    await Promise.all([
      recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset }),
      recordRecentWork(OFFLINE_ORG, { kind: 'photo', photo }),
    ])
    const stored = await readOfflineRecord(
      offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, 'recent-work'),
    )
    const items = localRecentActivitySchema.parse(stored?.value).items
    expect(items).toHaveLength(2)
    expect(new Set(items.map((item) => item.kind))).toEqual(new Set(['photo', 'preset']))
    const recent = await recentItems()
    expect(recent.items).toHaveLength(2)
    expect(recent.pendingKeys).toHaveLength(2)
  })

  it('does not expose another account’s pending work or view preference', async () => {
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset: offlinePreset() })
    await changeRecentView('details')
    setOfflineUser('another-account')
    expect(await viewPreference()).toBe('thumbnails')
    await expect(recentItems()).rejects.toThrow('Connect once')
    setOfflineUser(OFFLINE_USER)
    expect(await viewPreference()).toBe('details')
  })

  it('aborts a failed atomic updater without committing or altering the prior value', async () => {
    const key = offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, 'atomic')
    await cacheOfflineRecord({
      key,
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: 'original',
    })
    await expect(
      updateOfflineRecord(key, () => {
        throw new Error('Rejected change')
      }),
    ).rejects.toThrow()
    const stored = await readOfflineRecord(key)
    expect(stored?.value).toBe('original')
    await expect(
      updateOfflineRecord(key, () => ({
        key: 'wrong-key',
        userId: OFFLINE_USER,
        organizationId: OFFLINE_ORG,
        value: 'wrong',
      })),
    ).rejects.toThrow()
    const restored = await readOfflineRecord(key)
    expect(restored?.value).toBe('original')
  })
})
