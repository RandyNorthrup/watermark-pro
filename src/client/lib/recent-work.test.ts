import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCOUNT_CHANGED_EVENT } from './offline-account'
import { setOfflineUser } from './offline-context'
import { offlineRecordKey, readOfflineRecord, updateOfflineRecord } from './offline-database'
import type { CachedRecord, PendingOperation } from './offline-model'
import {
  changeRecentView,
  mergeRecentItems,
  recordRecentWork,
  recentViewQueryOptions,
  recentWorkQueryOptions,
  subscribeRecentWork,
} from './recent-work'
import { noteRecentWork } from './recent-work-events'
import { clearRecentWorkProblem, recentWorkProblem } from './recent-work-notifications'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import {
  localRecentActivitySchema,
  RECENT_HISTORY_LIMIT,
  type RecentWorkItem,
} from '../../shared/recent-work'
import {
  OFFLINE_DATE,
  OFFLINE_ORG,
  OFFLINE_USER,
  offlineOperation,
  offlinePhoto,
  offlinePreset,
} from '../test-support/offline-fixtures'

const storage = vi.hoisted(() => ({
  records: new Map<string, CachedRecord>(),
  operations: [] as PendingOperation[],
}))
vi.mock(import('./offline-database'), async (original) => ({
  ...(await original()),
  readOfflineRecord: vi.fn((key: string) => Promise.resolve(storage.records.get(key) ?? null)),
  cacheOfflineRecord: vi.fn((record: CachedRecord) => {
    storage.records.set(record.key, record)
    return Promise.resolve()
  }),
  updateOfflineRecord: vi.fn(
    (key: string, updater: (record: CachedRecord | null) => CachedRecord) => {
      storage.records.set(key, updater(storage.records.get(key) ?? null))
      return Promise.resolve()
    },
  ),
  offlineOperations: vi.fn((userId: string) =>
    Promise.resolve(storage.operations.filter((row) => row.userId === userId)),
  ),
}))

let client: QueryClient
beforeEach(() => {
  storage.records.clear()
  storage.operations = []
  clearRecentWorkProblem()
  setOfflineUser(OFFLINE_USER)
  vi.stubGlobal('indexedDB', {})
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function history() {
  return client.query(recentWorkQueryOptions(OFFLINE_ORG))
}
function preference() {
  return client.query(recentViewQueryOptions())
}
function localKey() {
  return offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, 'recent-work')
}
function pending() {
  return localRecentActivitySchema.parse(storage.records.get(localKey())?.value).items
}
function setOnline() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
}
function server(items: RecentWorkItem[] = []) {
  const fetcher = vi.fn<typeof fetch>((_url, init) =>
    Promise.resolve(
      init?.method === 'POST' ? new Response(null, { status: 204 }) : Response.json({ items }),
    ),
  )
  vi.stubGlobal('fetch', fetcher)
  setOnline()
  return fetcher
}

describe('recent activity data boundaries', () => {
  it('rejects a foreign workspace DTO inside a correctly scoped cache envelope or response', async () => {
    const preset = { ...offlinePreset(), organizationId: 'foreign-workspace' }
    const item: RecentWorkItem = { kind: 'preset', preset, usedAt: OFFLINE_DATE }
    storage.records.set(localKey(), {
      key: localKey(),
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: { items: [item] },
    })
    await expect(history()).rejects.toThrow('another workspace')
    storage.records.clear()
    server([item])
    await expect(history()).rejects.toThrow('another workspace')
  })

  it('orders actual use, keeps kinds distinct even for the same ID, and ignores older replays', () => {
    const preset = offlinePreset()
    const photo = { ...offlinePhoto(), id: preset.id }
    const first: RecentWorkItem = { kind: 'preset', preset, usedAt: '2026-01-01T00:00:00.000Z' }
    const second: RecentWorkItem = { ...first, usedAt: '2026-02-01T00:00:00.000Z' }
    const result = mergeRecentItems(
      [second, { kind: 'photo', photo, usedAt: first.usedAt }],
      [first],
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(second)
  })

  it('retains a bounded local history and refuses foreign-workspace content', async () => {
    const preset = offlinePreset()
    const items = Array.from({ length: RECENT_HISTORY_LIMIT }, (_, index): RecentWorkItem => ({
      kind: 'preset',
      preset: { ...preset, id: `older-${String(index)}` },
      usedAt: OFFLINE_DATE,
    }))
    storage.records.set(localKey(), {
      key: localKey(),
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: { items },
    })
    await recordRecentWork(OFFLINE_ORG, { kind: 'photo', photo: offlinePhoto() })
    expect(pending()).toHaveLength(RECENT_HISTORY_LIMIT)
    expect(pending()[0]?.kind).toBe('photo')
    await expect(recordRecentWork('foreign-org', { kind: 'preset', preset })).rejects.toThrow(
      'another workspace',
    )
  })

  it.each(['owner', 'organization', 'schema'])(
    'refuses cached history with invalid %s scope',
    async (kind) => {
      storage.records.set(localKey(), {
        key: localKey(),
        userId: kind === 'owner' ? 'other-user' : OFFLINE_USER,
        organizationId: kind === 'organization' ? 'other-org' : OFFLINE_ORG,
        value: kind === 'schema' ? { items: [{ invalid: true }] } : { items: [] },
      })
      await expect(history()).rejects.toThrow()
      await expect(
        recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset: offlinePreset() }),
      ).rejects.toThrow()
    },
  )

  it('sends only account-bound resource identity and the captured event time when storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const fetcher = server()
    const preset = offlinePreset('A private name never sent in the event')
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset }, OFFLINE_DATE)
    const init = fetcher.mock.calls[0]?.[1]
    expect(init?.body).toBe(
      JSON.stringify({ kind: 'preset', resourceId: preset.id, usedAt: OFFLINE_DATE }),
    )
    expect(new Headers(init?.headers).get(ACCOUNT_ID_HEADER)).toBe(OFFLINE_USER)
    expect(storage.records.size).toBe(0)
    expect(await history()).toEqual({ items: [], pendingKeys: [], resourceStates: {} })
  })

  it('drops a deleted resource after a server404 but keeps an offline creation until its primary upload succeeds', async () => {
    const preset = offlinePreset()
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset })
    const fetcher = vi.fn<typeof fetch>((_url, init) =>
      Promise.resolve(
        init?.method === 'POST'
          ? Response.json({ error: 'not_found' }, { status: 404 })
          : Response.json({ items: [] }),
      ),
    )
    vi.stubGlobal('fetch', fetcher)
    setOnline()
    expect(await history()).toEqual({ items: [], pendingKeys: [], resourceStates: {} })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset })
    storage.operations = [{ ...offlineOperation({ kind: 'preset-create', preset }), sequence: 1 }]
    setOnline()
    const result = await history()
    expect(result.items[0]?.kind).toBe('preset')
    expect(result.pendingKeys).toHaveLength(1)
    expect(result.resourceStates[`preset:${preset.id}`]).toBe('pending')
  })

  it('merges real pending edits/statuses and filters local deletions without introducing unopened work', async () => {
    const preset = offlinePreset('Old name')
    const photo = offlinePhoto()
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset })
    await recordRecentWork(OFFLINE_ORG, { kind: 'photo', photo })
    const edited = { ...preset, name: 'Edited while offline' }
    storage.operations = [
      {
        ...offlineOperation({
          kind: 'preset-update',
          preset: edited,
          body: { name: edited.name, spec: edited.spec },
        }),
        state: 'conflict',
        sequence: 1,
      },
      { ...offlineOperation({ kind: 'photo-delete', photoIds: [photo.id] }), sequence: 2 },
      {
        ...offlineOperation(
          { kind: 'preset-create', preset: offlinePreset('Never opened') },
          'other-org',
        ),
        sequence: 3,
      },
    ]
    const result = await history()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ preset: { name: edited.name } })
    expect(result.resourceStates[`preset:${preset.id}`]).toBe('conflict')
  })

  it('does not return cached content after forbidden responses or after changing away and back during a response', async () => {
    const fetcher = server()
    fetcher.mockResolvedValue(Response.json({ error: 'forbidden' }, { status: 403 }))
    await expect(history()).rejects.toThrow('Your role')
    const deferred = Promise.withResolvers<Response>()
    fetcher.mockReturnValue(deferred.promise)
    const query = history()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    setOfflineUser('other-user')
    setOfflineUser(OFFLINE_USER)
    deferred.resolve(Response.json({ items: [] }))
    await expect(query).rejects.toThrow('account changed')
  })

  it('preserves a newer open while its older event is uploading', async () => {
    const preset = offlinePreset()
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset }, '2026-01-01T00:00:00.000Z')
    const deferred = Promise.withResolvers<Response>()
    const fetcher = server()
    fetcher.mockReturnValue(deferred.promise)
    const first = recordRecentWork(
      OFFLINE_ORG,
      { kind: 'preset', preset },
      '2026-02-01T00:00:00.000Z',
    )
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const second = recordRecentWork(
      OFFLINE_ORG,
      { kind: 'preset', preset },
      '2026-03-01T00:00:00.000Z',
    )
    await vi.waitFor(() => expect(pending()[0]?.usedAt).toBe('2026-03-01T00:00:00.000Z'))
    deferred.resolve(new Response(null, { status: 204 }))
    await Promise.all([first, second])
    expect(pending()[0]?.usedAt).toBe('2026-03-01T00:00:00.000Z')
  })
})

describe('recent view preference and tracking errors', () => {
  it('keeps the chosen view when Wi-Fi remains connected but requests cannot reach the server', async () => {
    await changeRecentView('details')
    setOnline()
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Network unavailable'))
    vi.stubGlobal('fetch', fetcher)
    await changeRecentView('list')
    expect(await preference()).toBe('list')
    fetcher.mockResolvedValue(Response.json({ view: 'list' }))
    expect(await preference()).toBe('list')
    fetcher.mockRejectedValue(new TypeError('Network unavailable'))
    expect(await preference()).toBe('list')
  })

  it('keeps a later offline view choice when an older online save completes', async () => {
    const deferred = Promise.withResolvers<Response>()
    const fetcher = vi.fn<typeof fetch>(() => deferred.promise)
    vi.stubGlobal('fetch', fetcher)
    setOnline()
    const saving = changeRecentView('details')
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await changeRecentView('list')
    deferred.resolve(Response.json({ view: 'details' }))
    await saving
    expect(await preference()).toBe('list')
  })

  it('persists offline view preferences, replays them online, then respects the server preference', async () => {
    expect(await preference()).toBe('thumbnails')
    await changeRecentView('details')
    expect(await preference()).toBe('details')
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ view: 'details' })))
    vi.stubGlobal('fetch', fetcher)
    setOnline()
    expect(await preference()).toBe('details')
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('PATCH')
    fetcher.mockResolvedValue(Response.json({ view: 'list' }))
    expect(await preference()).toBe('list')
  })

  it('rejects unavailable offline storage and cross-account preference records', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(changeRecentView('details')).rejects.toThrow('Device storage')
    vi.stubGlobal('indexedDB', {})
    const key = offlineRecordKey(OFFLINE_USER, '', 'recent-work-view')
    storage.records.set(key, {
      key,
      userId: 'other-user',
      organizationId: '',
      value: { view: 'details', pending: false },
    })
    await expect(preference()).rejects.toThrow('scope mismatch')
  })

  it('exposes storage failure separately and clears it after a successful retry or account change', async () => {
    const changed = vi.fn()
    const stop = subscribeRecentWork(changed)
    vi.mocked(updateOfflineRecord).mockRejectedValueOnce(new Error('Storage full'))
    const preset = offlinePreset()
    noteRecentWork(OFFLINE_ORG, { kind: 'preset', preset })
    await vi.waitFor(() => expect(recentWorkProblem(OFFLINE_ORG)).toContain('Reopen the item'))
    expect(recentWorkProblem('other-org')).toBeNull()
    await recordRecentWork(OFFLINE_ORG, { kind: 'preset', preset })
    expect(recentWorkProblem(OFFLINE_ORG)).toBeNull()
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    expect(changed).toHaveBeenCalled()
    stop()
    changed.mockClear()
    window.dispatchEvent(new Event('online'))
    expect(changed).not.toHaveBeenCalled()
  })

  it('invalidates an action captured before lazy loading when the user changes away and back', async () => {
    noteRecentWork(OFFLINE_ORG, { kind: 'preset', preset: offlinePreset() })
    setOfflineUser('other-user')
    setOfflineUser(OFFLINE_USER)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(storage.records.size).toBe(0)
    expect(recentWorkProblem(OFFLINE_ORG)).toBeNull()
  })

  it('rejects a stale read before returning account-scoped local data', async () => {
    vi.mocked(readOfflineRecord).mockImplementationOnce(() => {
      setOfflineUser('other-user')
      return Promise.resolve(null)
    })
    await expect(history()).rejects.toThrow('account changed')
  })
})
