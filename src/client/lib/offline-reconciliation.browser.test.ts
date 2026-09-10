/** Authoritative refreshes remove acknowledged overlays without losing offline media. */
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { photosQueryOptions } from './gallery'
import { assetsQueryOptions, watermarksQueryOptions } from './library'
import { setOfflineUser } from './offline-context'
import {
  cacheOfflineRecord,
  clearOfflineDatabase,
  commitOfflineChange,
  offlineOperations,
  offlineRecordKey,
} from './offline-database'
import { loadWorkspaceMedia } from './offline-media'
import { workspaceCacheReconciliation } from './offline-reconciliation'
import { mergeLocalPresets } from './offline-workspace'
import {
  OFFLINE_ORG,
  OFFLINE_USER,
  offlineAsset,
  offlineOperation,
  offlinePhoto,
  offlinePreset,
} from '../test-support/offline-fixtures'

beforeEach(async () => {
  await clearOfflineDatabase()
  setOfflineUser(OFFLINE_USER)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('acknowledged cache reconciliation', () => {
  it('searches a fully prepared gallery offline without a previously cached search URL', async () => {
    const first = { ...offlinePhoto(), name: 'Coast.png' }
    const second = { ...offlinePhoto(), name: 'Family portrait.png' }
    const root = `/api/orgs/${OFFLINE_ORG}/photos`
    for (const [path, value] of [
      [root, { photos: [first], nextCursor: 'second' }],
      [`${root}?cursor=second`, { photos: [second], nextCursor: null }],
    ] as const) {
      await cacheOfflineRecord({
        key: offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, path),
        userId: OFFLINE_USER,
        organizationId: OFFLINE_ORG,
        value,
      })
    }
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const result = await new QueryClient().infiniteQuery(
      photosQueryOptions(OFFLINE_ORG, { search: 'portrait' }),
    )
    expect(result.pages[0]).toEqual({ photos: [second], nextCursor: null })
    const empty = await new QueryClient().infiniteQuery(
      photosQueryOptions(OFFLINE_ORG, { search: 'not-present' }),
    )
    expect(empty.pages[0]?.photos).toEqual([])
    setOfflineUser('different-user')
    await expect(
      new QueryClient().infiniteQuery(photosQueryOptions(OFFLINE_ORG, { search: 'portrait' })),
    ).rejects.toThrow('full gallery')
  })
  it('cannot resurrect a remotely deleted preset after refreshing online and reopening offline', async () => {
    const preset = offlinePreset()
    await commitOfflineChange({
      ...offlineOperation({ kind: 'preset-create', preset }),
      state: 'synced',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ watermarks: [] }))),
    )
    const client = new QueryClient()
    expect(await client.query(watermarksQueryOptions(OFFLINE_ORG))).toEqual([])
    expect(await offlineOperations(OFFLINE_USER)).toEqual([])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await new QueryClient().query(watermarksQueryOptions(OFFLINE_ORG))).toEqual([])
  })

  it('moves a confirmed photo into the durable media cache when its journal is retired', async () => {
    const photo = offlinePhoto()
    await commitOfflineChange({
      ...offlineOperation({
        kind: 'photo-upload',
        photo,
        blob: new Blob(['photo bytes']),
        thumbnail: new Blob(['thumbnail bytes']),
      }),
      state: 'synced',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ photos: [photo], nextCursor: null }))),
    )
    const result = await new QueryClient().infiniteQuery(photosQueryOptions(OFFLINE_ORG, {}))
    expect(result.pages[0]?.photos).toEqual([photo])
    expect(await offlineOperations(OFFLINE_USER)).toEqual([])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const blob = await loadWorkspaceMedia(
      OFFLINE_ORG,
      `/api/orgs/${OFFLINE_ORG}/photos/${photo.id}/file`,
    )
    expect(await blob.text()).toBe('photo bytes')
    const thumbnail = await loadWorkspaceMedia(
      OFFLINE_ORG,
      `/api/orgs/${OFFLINE_ORG}/photos/${photo.id}/thumbnail`,
    )
    expect(await thumbnail.text()).toBe('thumbnail bytes')
  })

  it('keeps logo bytes after a full list refresh and removes remotely deleted logos', async () => {
    const asset = offlineAsset()
    await commitOfflineChange({
      ...offlineOperation({ kind: 'logo-upload', asset, blob: new Blob(['logo bytes']) }),
      state: 'synced',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ assets: [asset] }))),
    )
    expect(await new QueryClient().query(assetsQueryOptions(OFFLINE_ORG))).toEqual([asset])
    expect(await offlineOperations(OFFLINE_USER)).toEqual([])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const logo = await loadWorkspaceMedia(
      OFFLINE_ORG,
      `/api/orgs/${OFFLINE_ORG}/assets/${asset.id}/file`,
    )
    expect(await logo.text()).toBe('logo bytes')
  })

  it('retains acknowledgements that race a list request and does not infer deletion from a partial page', async () => {
    const first = offlinePreset('First')
    await commitOfflineChange({
      ...offlineOperation({ kind: 'preset-create', preset: first }),
      state: 'synced',
    })
    const reconcile = await workspaceCacheReconciliation(OFFLINE_ORG, 'preset')
    const later = offlinePreset('Later')
    await commitOfflineChange({
      ...offlineOperation({ kind: 'preset-create', preset: later }),
      state: 'synced',
    })
    await reconcile([], false)
    expect(await offlineOperations(OFFLINE_USER)).toHaveLength(2)
    await reconcile([], true)
    expect(await mergeLocalPresets(OFFLINE_ORG, [], true)).toEqual([later])
  })

  it('includes acknowledged local gallery saves when the network fails despite navigator reporting online', async () => {
    const path = `/api/orgs/${OFFLINE_ORG}/photos`
    await cacheOfflineRecord({
      key: offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, path),
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: { photos: [], nextCursor: null },
    })
    const photo = offlinePhoto()
    await commitOfflineChange({
      ...offlineOperation({
        kind: 'photo-upload',
        photo,
        blob: new Blob(['photo']),
        thumbnail: new Blob(['thumb']),
      }),
      state: 'synced',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Network disconnected'))),
    )
    const result = await new QueryClient().infiniteQuery(photosQueryOptions(OFFLINE_ORG, {}))
    expect(result.pages[0]?.photos).toEqual([photo])
    expect(await offlineOperations(OFFLINE_USER)).toHaveLength(1)
  })
})
