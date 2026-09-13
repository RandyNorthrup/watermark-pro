/** Real IndexedDB preserves folder dependencies and detects conflicting reconnects. */
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFolder, foldersQueryOptions, movePhotos, movePresets, updateFolder } from './folders'
import { photosQueryOptions } from './gallery'
import { watermarksQueryOptions } from './library'
import { setOfflineUser } from './offline-context'
import {
  cacheOfflineRecord,
  clearOfflineDatabase,
  offlineOperations,
  offlineRecordKey,
  pendingOperations,
} from './offline-database'
import { offlineChangeSchema } from './offline-model'
import { workspaceCacheReconciliation } from './offline-reconciliation'
import { synchronizeOfflineWork } from './offline-sync'
import { mergeLocalPresets, savePhotoLocally, savePresetLocally } from './offline-workspace'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import { SYNC_OPERATION_HEADER } from '../../shared/sync'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import {
  OFFLINE_ORG,
  OFFLINE_USER,
  offlinePhoto,
  offlinePreset,
} from '../test-support/offline-fixtures'

vi.mock('./auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(async () => {
  await clearOfflineDatabase()
  setOfflineUser(OFFLINE_USER)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  installFakeAuth()
  fakeAuth().state.user = {
    id: OFFLINE_USER,
    name: 'Owner',
    email: 'owner@example.test',
    emailVerified: true,
    image: null,
  }
  for (const [suffix, value] of [
    ['/folders?kind=preset', { folders: [] }],
    ['/folders?kind=photo', { folders: [] }],
    ['/watermarks', { watermarks: [] }],
    ['/photos', { photos: [], nextCursor: null }],
  ] as const)
    await cacheOfflineRecord({
      key: offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, `/api/orgs/${OFFLINE_ORG}${suffix}`),
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value,
    })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('first-party folders offline', () => {
  it('restores nested folders and saved destinations, then replays parents, files and moves in order', async () => {
    const root = await createFolder(OFFLINE_ORG, 'preset', 'Clients', null)
    const child = await createFolder(OFFLINE_ORG, 'preset', 'Drafts', root.id)
    const preset = await savePresetLocally(OFFLINE_ORG, {
      name: 'Private Draft',
      spec: DEFAULT_TEXT_SPEC,
      folderId: child.id,
    })
    await movePresets(OFFLINE_ORG, [preset], root.id)
    await updateFolder(child, 'Finals', root.id)
    const photos = await createFolder(OFFLINE_ORG, 'photo', 'Deliveries', null)
    const photo = { ...offlinePhoto(), folderId: photos.id }
    const bytes = new Blob(['original image bytes'], { type: 'image/png' })
    await savePhotoLocally(OFFLINE_ORG, photo, bytes, new Blob(['thumbnail']))
    await movePhotos(OFFLINE_ORG, [photo], null)

    // A new query client and account generation have no in-memory editor state to reuse.
    setOfflineUser(null)
    setOfflineUser(OFFLINE_USER)
    const restored = new QueryClient()
    const tree = await restored.query(foldersQueryOptions(OFFLINE_ORG, 'preset'))
    expect(tree.find((folder) => folder.id === root.id)).toMatchObject({
      name: 'Clients',
      childCount: 1,
      itemCount: 1,
    })
    expect(tree.find((folder) => folder.id === child.id)).toMatchObject({
      name: 'Finals',
      parentId: root.id,
      itemCount: 0,
    })
    const library = await restored.query(watermarksQueryOptions(OFFLINE_ORG))
    expect(library).toHaveLength(1)
    expect(library[0]).toMatchObject({
      name: 'Private Draft',
      folderId: root.id,
      folderRevision: 1,
    })
    const gallery = await restored.infiniteQuery(
      photosQueryOptions(OFFLINE_ORG, { folderId: null }),
    )
    expect(gallery.pages[0]?.photos.map((item) => item.id)).toEqual([photo.id])
    const oldDestination = await restored.infiniteQuery(
      photosQueryOptions(OFFLINE_ORG, { folderId: photos.id }),
    )
    expect(oldDestination.pages[0]?.photos).toEqual([])

    const pending = await pendingOperations(OFFLINE_USER)
    const byId = new Map(pending.map((operation) => [operation.id, operation]))
    const order: string[] = []
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        expect(headers.get(ACCOUNT_ID_HEADER)).toBe(OFFLINE_USER)
        const operation = byId.get(headers.get(SYNC_OPERATION_HEADER) ?? '')
        if (operation === undefined) throw new Error('Unexpected replay identity')
        const { change } = operation
        order.push(change.kind)
        if ('folder' in change) {
          if (typeof init?.body !== 'string') throw new Error('Expected folder JSON')
          const body: unknown = JSON.parse(init.body)
          if (change.kind === 'folder-update')
            expect(body).toMatchObject({ expectedRevision: 0, expectedVersionId: child.versionId })
          return Response.json({ folder: change.folder, moved: [] })
        }
        if (change.kind === 'preset-create') {
          expect(init?.body).toBe(
            JSON.stringify({ name: preset.name, spec: preset.spec, folderId: child.id }),
          )
          return Response.json(change.preset)
        }
        if (change.kind === 'photo-upload') {
          const form = init?.body
          if (!(form instanceof FormData)) throw new Error('Expected photo form')
          expect(form.get('folderId')).toBe(photos.id)
          const file = form.get('file')
          if (!(file instanceof Blob)) throw new Error('Expected original bytes')
          expect(await file.text()).toBe('original image bytes')
          return Response.json(change.photo)
        }
        if (change.kind === 'photo-move' || change.kind === 'preset-move') {
          if (typeof init?.body !== 'string') throw new Error('Expected move JSON')
          expect(JSON.parse(init.body)).toMatchObject({
            items: [{ expectedFolderRevision: 0, expectedFolderVersionId: null }],
          })
          return Response.json({ folder: null, moved: change.placements })
        }
        throw new Error('Unexpected queued operation')
      }),
    )
    await synchronizeOfflineWork(restored)
    expect(order).toEqual([
      'folder-create',
      'folder-create',
      'preset-create',
      'preset-move',
      'folder-update',
      'folder-create',
      'photo-upload',
      'photo-move',
    ])
    expect(await pendingOperations(OFFLINE_USER)).toEqual([])
    const reconcile = await workspaceCacheReconciliation(OFFLINE_ORG, 'folder', 'preset')
    await reconcile([root.id, child.id], true)
    const remaining = await offlineOperations(OFFLINE_USER)
    expect(
      remaining.some(
        (operation) => 'folder' in operation.change && operation.change.folder.kind === 'preset',
      ),
    ).toBe(false)
    expect(
      remaining.some(
        (operation) => 'folder' in operation.change && operation.change.folder.kind === 'photo',
      ),
    ).toBe(true)
  })

  it('decodes old unfiled saves without changing their IDs, bytes or queue format', async () => {
    const original = offlinePreset()
    const legacy = {
      id: original.id,
      organizationId: original.organizationId,
      name: original.name,
      spec: original.spec,
      createdBy: original.createdBy,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
    }
    const decoded = offlineChangeSchema.parse({ kind: 'preset-create', preset: legacy })
    expect(decoded).toEqual({
      kind: 'preset-create',
      preset: { ...legacy, folderId: null, folderRevision: 0, folderVersionId: null },
    })
    await cacheOfflineRecord({
      key: offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, `/api/orgs/${OFFLINE_ORG}/watermarks`),
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: { watermarks: [legacy] },
    })
    const values = await new QueryClient().query(watermarksQueryOptions(OFFLINE_ORG))
    expect(values[0]).toMatchObject({
      id: original.id,
      folderId: null,
      folderRevision: 0,
      folderVersionId: null,
    })
  })

  it('keeps conflicting dependencies queued and preserves a remote preset name when displaying a local move', async () => {
    const folder = await createFolder(OFFLINE_ORG, 'preset', 'Local', null)
    const preset = offlinePreset('Original')
    await movePresets(OFFLINE_ORG, [preset], folder.id)
    const merged = await mergeLocalPresets(OFFLINE_ORG, [{ ...preset, name: 'Collaborator Name' }])
    expect(merged[0]).toMatchObject({ name: 'Collaborator Name', folderId: folder.id })
    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json({ error: 'conflict' }, { status: 409 })),
    )
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await synchronizeOfflineWork(new QueryClient())
    expect(fetcher).toHaveBeenCalledOnce()
    const pending = await pendingOperations(OFFLINE_USER)
    expect(pending.map((operation) => operation.state)).toEqual(['conflict', 'pending'])
  })

  it('does not acknowledge a folder into a different account when sign-in changes during replay', async () => {
    const folder = await createFolder(OFFLINE_ORG, 'preset', 'Private', null)
    const request = Promise.withResolvers<Response>()
    const fetcher = vi.fn(() => request.promise)
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const sync = synchronizeOfflineWork(new QueryClient())
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    setOfflineUser('different-account')
    request.resolve(Response.json({ folder, moved: [] }))
    await sync
    expect(await pendingOperations('different-account')).toEqual([])
    setOfflineUser(OFFLINE_USER)
    const [pending] = await pendingOperations(OFFLINE_USER)
    expect(pending?.state).toBe('pending')
  })

  it('rejects wrong workspace inputs and keeps mismatched server move acknowledgments pending', async () => {
    const preset = offlinePreset()
    await expect(movePresets('foreign-workspace', [preset], null)).rejects.toThrow(
      'another workspace',
    )
    expect(await pendingOperations(OFFLINE_USER)).toEqual([])
    await movePresets(OFFLINE_ORG, [preset], null)
    const [operation] = await pendingOperations(OFFLINE_USER)
    if (operation?.change.kind !== 'preset-move') throw new Error('Expected pending move')
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            folder: null,
            moved:
              operation.change.kind === 'preset-move'
                ? operation.change.placements.map((placement) => ({
                    ...placement,
                    folderVersionId: crypto.randomUUID(),
                  }))
                : [],
          }),
        ),
      ),
    )
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await synchronizeOfflineWork(new QueryClient())
    const [pending] = await pendingOperations(OFFLINE_USER)
    expect(pending?.state).toBe('pending')
  })
})
