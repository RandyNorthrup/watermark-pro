/** Real IndexedDB plus controlled transport failures prove replay ownership, ordering and recovery. */
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setOfflineUser } from './offline-context'
import {
  clearOfflineDatabase,
  commitOfflineChange,
  offlineOperations,
  pendingOperations,
} from './offline-database'
import { offlineStatus } from './offline-status'
import { installOfflineSync, refreshOfflineStatus, synchronizeOfflineWork } from './offline-sync'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import {
  OFFLINE_USER,
  offlineAsset,
  offlineOperation,
  offlinePhoto,
  offlinePreset,
} from '../test-support/offline-fixtures'

vi.mock('./auth-client', () => import('../test-support/fake-auth-module'))

const SERVER_DATE = '2026-09-08T02:00:00.000Z'

beforeEach(async () => {
  await clearOfflineDatabase()
  setOfflineUser(OFFLINE_USER)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  installFakeAuth()
  fakeAuth().state.user = {
    id: OFFLINE_USER,
    name: 'Offline Owner',
    email: 'offline@example.test',
    emailVerified: true,
    image: null,
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('offline replay', () => {
  it('keeps the live session check but does not refetch every workspace when the outbox is empty', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await synchronizeOfflineWork(client)
    expect(fakeAuth().getSession).toHaveBeenCalledOnce()
    expect(invalidate).not.toHaveBeenCalled()
    expect(offlineStatus().syncing).toBe(false)
  })

  it('uploads a logo before its dependent preset and retries an acknowledged deletion safely', async () => {
    const asset = offlineAsset()
    const preset = offlinePreset()
    await commitOfflineChange(
      offlineOperation({
        kind: 'logo-upload',
        asset,
        blob: new Blob(['logo'], { type: 'image/png' }),
      }),
    )
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset }))
    await commitOfflineChange(offlineOperation({ kind: 'logo-delete', assetId: asset.id }))
    const paths: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        paths.push(url)
        if (init?.method === 'DELETE')
          return Promise.resolve(Response.json({ error: 'not_found' }, { status: 404 }))
        if (url.endsWith('/assets')) {
          expect(init?.body).toBeInstanceOf(FormData)
          expect(new Headers(init?.headers).get('x-watermark-operation')).toBe(asset.id)
          return Promise.resolve(Response.json(asset))
        }
        return Promise.resolve(Response.json(preset))
      }),
    )
    await synchronizeOfflineWork(new QueryClient())
    expect(paths.map((url) => url.split('/').at(-1))).toEqual(['assets', 'watermarks', asset.id])
    expect(await pendingOperations(OFFLINE_USER)).toEqual([])
  })
  it('sends a stable create identity and rebases the following local edit on its acknowledged version', async () => {
    const original = offlinePreset()
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: original }))
    await commitOfflineChange(
      offlineOperation({
        kind: 'preset-update',
        preset: { ...original, name: 'Later edit' },
        body: { name: 'Later edit', spec: original.spec, expectedUpdatedAt: original.updatedAt },
      }),
    )
    const calls: { method: string | undefined; headers: Headers; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (typeof init?.body !== 'string') {
          throw new TypeError('Expected a JSON request')
        }
        const body: unknown = JSON.parse(init.body)
        calls.push({ method: init.method, headers: new Headers(init.headers), body })
        return Promise.resolve(
          Response.json({
            ...original,
            name: init.method === 'PUT' ? 'Later edit' : original.name,
            updatedAt: SERVER_DATE,
          }),
        )
      }),
    )
    await synchronizeOfflineWork(new QueryClient())
    expect(calls.map((call) => call.method)).toEqual(['POST', 'PUT'])
    expect(calls[0]?.headers.get('x-watermark-operation')).toBe(original.id)
    expect(calls[1]?.body).toMatchObject({ name: 'Later edit', expectedUpdatedAt: SERVER_DATE })
    expect(await pendingOperations(OFFLINE_USER)).toEqual([])
    const confirmed = await offlineOperations(OFFLINE_USER)
    expect(confirmed.map((operation) => operation.state)).toEqual(['synced', 'synced'])
  })

  it('retains a network failure for a retry with the same operation id', async () => {
    const preset = offlinePreset()
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset }))
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValue(Response.json(preset))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient()
    await synchronizeOfflineWork(client)
    expect(await pendingOperations(OFFLINE_USER)).toHaveLength(1)
    expect(offlineStatus().syncing).toBe(false)
    await synchronizeOfflineWork(client)
    expect(await pendingOperations(OFFLINE_USER)).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([
    { status: 409, error: 'conflict', state: 'conflict' },
    { status: 403, error: 'forbidden', state: 'blocked' },
    { status: 401, error: 'unauthenticated', state: 'blocked' },
  ])(
    'preserves an HTTP $status refusal and continues a different authorized workspace',
    async ({ status, error, state }) => {
      const first = offlinePreset('First')
      const second = { ...offlinePreset('Second'), organizationId: 'other-studio' }
      await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: first }))
      await commitOfflineChange(
        offlineOperation({ kind: 'preset-delete', presetId: 'later-in-same-org' }),
      )
      await commitOfflineChange(
        offlineOperation({ kind: 'preset-create', preset: second }, 'other-studio'),
      )
      const fetcher = vi.fn((path: string) =>
        Promise.resolve(
          path.includes('/other-studio/')
            ? Response.json(second)
            : Response.json({ error }, { status }),
        ),
      )
      vi.stubGlobal('fetch', fetcher)
      await synchronizeOfflineWork(new QueryClient())
      const pending = await pendingOperations(OFFLINE_USER)
      expect(pending.map((operation) => operation.state)).toEqual([state, 'pending'])
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(offlineStatus().blocked).toBe(1)
    },
  )

  it.each([429, 503])('keeps HTTP %s retryable', async (status) => {
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error: 'rate_limited' }, { status }))),
    )
    await synchronizeOfflineWork(new QueryClient())
    const pending = await pendingOperations(OFFLINE_USER)
    expect(pending[0]?.state).toBe('pending')
  })

  it('does not send another account’s queued work or send while offline', async () => {
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    fakeAuth().state.user = {
      id: 'different-user',
      name: 'Different Owner',
      email: 'different@example.test',
      emailVerified: true,
      image: null,
    }
    await synchronizeOfflineWork(new QueryClient())
    expect(fetcher).not.toHaveBeenCalled()
    expect(await pendingOperations(OFFLINE_USER)).toHaveLength(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await synchronizeOfflineWork(new QueryClient())
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('replays binary gallery saves and makes repeated deletes safe', async () => {
    const photo = offlinePhoto()
    await commitOfflineChange(
      offlineOperation({
        kind: 'photo-upload',
        photo,
        blob: new Blob(['data'], { type: 'image/png' }),
        thumbnail: new Blob(['thumb'], { type: 'image/jpeg' }),
      }),
    )
    await commitOfflineChange(offlineOperation({ kind: 'photo-delete', photoIds: [photo.id] }))
    await commitOfflineChange(
      offlineOperation({ kind: 'preset-delete', presetId: 'already-deleted' }),
    )
    const calls: RequestInit[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string, init: RequestInit) => {
        calls.push(init)
        if (path.endsWith('/photos')) {
          return Promise.resolve(Response.json(photo))
        }
        if (path.endsWith('/delete')) {
          return Promise.resolve(Response.json({ deleted: 0 }))
        }
        return Promise.resolve(Response.json({ error: 'not_found' }, { status: 404 }))
      }),
    )
    await synchronizeOfflineWork(new QueryClient())
    expect(calls[0]?.body).toBeInstanceOf(FormData)
    const body = calls[0]?.body
    if (!(body instanceof FormData)) {
      throw new TypeError('Expected a multipart upload')
    }
    const file = body.get('file')
    if (!(file instanceof Blob)) {
      throw new TypeError('Expected uploaded bytes')
    }
    expect(await file.text()).toBe('data')
    expect(body.get('presetId')).toBeNull()
    expect(await pendingOperations(OFFLINE_USER)).toEqual([])
  })

  it('installs reconnect listeners, observes pending work and disposes cleanly', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const client = new QueryClient()
    const dispose = installOfflineSync(client)
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
    window.dispatchEvent(new Event('online'))
    await refreshOfflineStatus()
    expect(offlineStatus().pending).toBe(1)
    dispose()
    await synchronizeOfflineWork(client)
    expect(await pendingOperations(OFFLINE_USER)).toHaveLength(1)
  })
})
