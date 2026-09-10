/** Workspace reads, binary persistence and local overlays against the browser's real IndexedDB. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { cachedWorkspaceJson } from './offline-cache'
import { offlineUserId, setOfflineUser } from './offline-context'
import {
  cacheOfflineRecord,
  clearOfflineDatabase,
  commitOfflineChange,
  offlineOperations,
  offlineRecordKey,
  pendingOperations,
  readOfflineRecord,
  updatePendingOperation,
} from './offline-database'
import { loadWorkspaceMedia } from './offline-media'
import { offlineStatus, subscribeOfflineStatus, updateOfflineStatus } from './offline-status'
import {
  deleteLocally,
  mergeLocalPhotos,
  mergeLocalPresets,
  savePhotoLocally,
  savePresetLocally,
} from './offline-workspace'
import {
  OFFLINE_ORG,
  OFFLINE_USER,
  offlineOperation,
  offlinePhoto,
  offlinePreset,
} from '../test-support/offline-fixtures'

const PATH = `/api/orgs/${OFFLINE_ORG}/fixture`
const SCHEMA = z.object({ value: z.string() })

beforeEach(async () => {
  await clearOfflineDatabase()
  setOfflineUser(OFFLINE_USER)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('scoped offline reads', () => {
  it('rejects an in-flight response after account switch without caching it for either account', async () => {
    const response = Promise.withResolvers<Response>()
    const fetcher = vi.fn((_path: string, _init?: RequestInit) => response.promise)
    vi.stubGlobal('fetch', fetcher)
    const read = cachedWorkspaceJson(OFFLINE_ORG, PATH, SCHEMA)
    setOfflineUser('different-user')
    response.resolve(Response.json({ value: 'Private old account canary' }))
    await expect(read).rejects.toThrow('account changed')
    expect(await readOfflineRecord(offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, PATH))).toBeNull()
    expect(
      await readOfflineRecord(offlineRecordKey('different-user', OFFLINE_ORG, PATH)),
    ).toBeNull()
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
    expect(headers.get('x-lumafoil-account-id')).toBe(OFFLINE_USER)
  })
  it('caches validated data and restores it when a request loses the connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ value: 'Known server value' }))
        .mockRejectedValue(new TypeError('Offline')),
    )
    expect(await cachedWorkspaceJson(OFFLINE_ORG, PATH, SCHEMA)).toEqual({
      value: 'Known server value',
    })
    expect(await cachedWorkspaceJson(OFFLINE_ORG, PATH, SCHEMA)).toEqual({
      value: 'Known server value',
    })
    setOfflineUser('different-user')
    await expect(cachedWorkspaceJson(OFFLINE_ORG, PATH, SCHEMA)).rejects.toThrow('Connect once')
  })

  it('does not mask a server authorization denial with cached data', async () => {
    await cacheOfflineRecord({
      key: offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, PATH),
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: { value: 'Old access' },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 }))),
    )
    await expect(cachedWorkspaceJson(OFFLINE_ORG, PATH, SCHEMA)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('rejects malformed server data instead of storing or falling back to it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ value: 123 }))),
    )
    await expect(cachedWorkspaceJson(OFFLINE_ORG, PATH, SCHEMA)).rejects.toThrow()
    expect(await readOfflineRecord(offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, PATH))).toBeNull()
  })

  it('shows an explicit storage problem while allowing a successful online read', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ value: 'Online' }))),
    )
    expect(await cachedWorkspaceJson(OFFLINE_ORG, PATH, SCHEMA)).toEqual({ value: 'Online' })
    expect(offlineStatus().problem).toContain('not saved for offline')
  })

  it('reports a cache miss without attempting a request while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(cachedWorkspaceJson(OFFLINE_ORG, PATH, SCHEMA)).rejects.toThrow('Connect once')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('local workspace changes', () => {
  it('creates, edits and deletes a preset without a network and keeps unrelated remote presets', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const source = offlinePreset('Local')
    const saved = await savePresetLocally(OFFLINE_ORG, { name: source.name, spec: source.spec })
    expect(saved.id).not.toBe(source.id)
    const edited = await savePresetLocally(
      OFFLINE_ORG,
      { name: 'Edited offline', spec: saved.spec },
      saved,
    )
    const remote = offlinePreset('Unrelated')
    const merged = await mergeLocalPresets(OFFLINE_ORG, [remote])
    expect(merged.map((item) => item.name)).toEqual(['Unrelated', 'Edited offline'])
    await deleteLocally(OFFLINE_ORG, { kind: 'preset-delete', presetId: edited.id })
    expect(await mergeLocalPresets(OFFLINE_ORG, [remote])).toEqual([remote])
    const operations = await pendingOperations(OFFLINE_USER)
    expect(operations.map((operation) => operation.change.kind)).toEqual([
      'preset-create',
      'preset-update',
      'preset-delete',
    ])
    expect(await mergeLocalPresets('another-org', [remote])).toEqual([remote])
  })

  it('keeps an explicit version on an edit and respects confirmed remote data online', async () => {
    const preset = offlinePreset()
    await savePresetLocally(
      OFFLINE_ORG,
      { name: 'Local edit', spec: preset.spec, expectedUpdatedAt: preset.updatedAt },
      preset,
    )
    const [operation] = await pendingOperations(OFFLINE_USER)
    if (operation?.change.kind !== 'preset-update') {
      throw new Error('Expected an edit')
    }
    expect(operation.change.body.expectedUpdatedAt).toBe(preset.updatedAt)
    await updatePendingOperation({ ...operation, state: 'synced' })
    expect(await mergeLocalPresets(OFFLINE_ORG, [preset])).toEqual([preset])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const merged = await mergeLocalPresets(OFFLINE_ORG, [preset])
    expect(merged[0]?.name).toBe('Local edit')
  })

  it('durably saves a photo and thumbnail and filters its deletion from the gallery', async () => {
    const photo = offlinePhoto()
    const blob = new Blob(['image'], { type: 'image/png' })
    const thumbnail = new Blob(['thumbnail'], { type: 'image/jpeg' })
    expect(await savePhotoLocally(OFFLINE_ORG, photo, blob, thumbnail)).toEqual(photo)
    expect(await mergeLocalPhotos(OFFLINE_ORG, [])).toEqual([photo])
    const file = await loadWorkspaceMedia(
      OFFLINE_ORG,
      `/api/orgs/${OFFLINE_ORG}/photos/${photo.id}/file`,
    )
    expect(await file.text()).toBe('image')
    const thumb = await loadWorkspaceMedia(
      OFFLINE_ORG,
      `/api/orgs/${OFFLINE_ORG}/photos/${photo.id}/thumbnail`,
    )
    expect(await thumb.text()).toBe('thumbnail')
    await deleteLocally(OFFLINE_ORG, { kind: 'photo-delete', photoIds: [photo.id] })
    expect(await mergeLocalPhotos(OFFLINE_ORG, [photo])).toEqual([])
    expect(await offlineOperations(OFFLINE_USER)).toHaveLength(2)
  })

  it('requires an account before creating durable work', async () => {
    setOfflineUser(null)
    expect(offlineUserId).toThrow('Sign in')
    await expect(savePresetLocally(OFFLINE_ORG, offlinePreset())).rejects.toThrow('Sign in')
    expect(await pendingOperations(OFFLINE_USER)).toEqual([])
  })
})

describe('private media cache', () => {
  it('checks authorization for acknowledged uploads and honors local delete tombstones', async () => {
    const photo = offlinePhoto()
    const operation = offlineOperation({
      kind: 'photo-upload',
      photo,
      blob: new Blob(['secret']),
      thumbnail: new Blob(['thumb']),
    })
    await commitOfflineChange({ ...operation, state: 'synced' })
    const path = `/api/orgs/${OFFLINE_ORG}/photos/${photo.id}/file`
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 }))),
    )
    await expect(loadWorkspaceMedia(OFFLINE_ORG, path)).rejects.toMatchObject({ status: 403 })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const blob = await loadWorkspaceMedia(OFFLINE_ORG, path)
    expect(await blob.text()).toBe('secret')
    await deleteLocally(OFFLINE_ORG, { kind: 'photo-delete', photoIds: [photo.id] })
    await expect(loadWorkspaceMedia(OFFLINE_ORG, path)).rejects.toThrow('deleted')
  })

  it('rejects a mismatched workspace path before making any request', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      loadWorkspaceMedia(OFFLINE_ORG, '/api/orgs/someone-else/assets/logo/file'),
    ).rejects.toThrow('does not belong')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('downloads a logo once, restores it offline, and refuses a different account', async () => {
    const path = `/api/orgs/${OFFLINE_ORG}/assets/logo/file`
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new Blob(['logo'], { type: 'image/png' })))),
    )
    const downloaded = await loadWorkspaceMedia(OFFLINE_ORG, path)
    expect(await downloaded.text()).toBe('logo')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const cached = await loadWorkspaceMedia(OFFLINE_ORG, path)
    expect(await cached.text()).toBe('logo')
    setOfflineUser('different-user')
    await expect(loadWorkspaceMedia(OFFLINE_ORG, path)).rejects.toThrow('Connect to download')
  })

  it('does not read another workspace’s local export and does not mask an online 403', async () => {
    const photo = offlinePhoto()
    await commitOfflineChange(
      offlineOperation({
        kind: 'photo-upload',
        photo,
        blob: new Blob(['secret']),
        thumbnail: new Blob(['thumb']),
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 }))),
    )
    await expect(
      loadWorkspaceMedia('different-org', `/api/orgs/different-org/photos/${photo.id}/file`),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('reports media caching failures without discarding a successful download', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new Blob(['logo'])))),
    )
    const blob = await loadWorkspaceMedia(OFFLINE_ORG, '/api/orgs/offline-studio/assets/logo/file')
    expect(await blob.text()).toBe('logo')
    expect(offlineStatus().problem).toContain('image was not saved')
  })

  it('publishes immutable status snapshots and removes listeners when disposed', () => {
    const listener = vi.fn()
    const before = offlineStatus()
    const dispose = subscribeOfflineStatus(listener)
    updateOfflineStatus({ pending: 3 })
    expect(offlineStatus()).not.toBe(before)
    expect(listener).toHaveBeenCalledOnce()
    dispose()
    updateOfflineStatus({ pending: 0 })
    expect(listener).toHaveBeenCalledOnce()
  })
})
