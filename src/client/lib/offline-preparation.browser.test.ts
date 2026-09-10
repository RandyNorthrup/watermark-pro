/** Readiness is based on committed workspace records, including the logo bytes that presets need. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setOfflineUser } from './offline-context'
import { clearOfflineDatabase, commitOfflineChange, offlineOperations } from './offline-database'
import { prepareWorkspaceOffline } from './offline-preparation'
import {
  OFFLINE_ORG,
  OFFLINE_USER,
  offlineAsset,
  offlineOperation,
  offlinePhoto,
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

function transport() {
  const asset = offlineAsset()
  return vi.fn((path: string) => {
    if (path.endsWith('/watermarks')) return Promise.resolve(Response.json({ watermarks: [] }))
    if (path.endsWith('/assets')) return Promise.resolve(Response.json({ assets: [asset] }))
    if (path.endsWith('/photos'))
      return Promise.resolve(Response.json({ photos: [], nextCursor: null }))
    if (path.endsWith('/usage'))
      return Promise.resolve(
        Response.json({ count: 0, bytes: 0, maxCount: 5000, maxBytes: 1_073_741_824 }),
      )
    if (path.endsWith('/file'))
      return Promise.resolve(new Response(new Blob(['logo bytes'], { type: 'image/png' })))
    throw new Error(`Unexpected fixture request: ${path}`)
  })
}

describe('workspace offline readiness', () => {
  it('prepares every gallery page and retires deleted photo acknowledgements only after the complete list', async () => {
    const removed = offlinePhoto()
    await commitOfflineChange({
      ...offlineOperation({
        kind: 'photo-upload',
        photo: removed,
        blob: new Blob(['old bytes']),
        thumbnail: new Blob(['old thumbnail']),
      }),
      state: 'synced',
    })
    const base = transport()
    const fetcher = vi.fn((path: string) => {
      if (path.endsWith('/photos'))
        return Promise.resolve(
          Response.json({ photos: [offlinePhoto()], nextCursor: 'second-page' }),
        )
      if (path.endsWith('?cursor=second-page'))
        return Promise.resolve(Response.json({ photos: [], nextCursor: null }))
      return base(path)
    })
    vi.stubGlobal('fetch', fetcher)
    await prepareWorkspaceOffline(OFFLINE_ORG)
    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(await offlineOperations(OFFLINE_USER)).toEqual([])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await prepareWorkspaceOffline(OFFLINE_ORG)
    expect(fetcher).toHaveBeenCalledTimes(6)
  })

  it('refuses a repeated gallery cursor rather than reporting partial data ready', async () => {
    const base = transport()
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path.includes('/photos') && !path.endsWith('/usage')
          ? Promise.resolve(Response.json({ photos: [], nextCursor: 'same-page' }))
          : base(path),
      ),
    )
    await expect(prepareWorkspaceOffline(OFFLINE_ORG)).rejects.toThrow('repeated page')
  })
  it('prepares a workspace and its preset logo, then reopens entirely from committed data offline', async () => {
    const fetcher = transport()
    vi.stubGlobal('fetch', fetcher)
    await prepareWorkspaceOffline(OFFLINE_ORG)
    expect(fetcher).toHaveBeenCalledTimes(5)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await prepareWorkspaceOffline(OFFLINE_ORG)
    expect(fetcher).toHaveBeenCalledTimes(5)
  })
  it('does not promise readiness when storage could not commit a successful download', async () => {
    vi.stubGlobal('fetch', transport())
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    await expect(prepareWorkspaceOffline(OFFLINE_ORG)).rejects.toThrow('could not be saved')
  })
  it('requires an initial connection and never uses another account records to report ready', async () => {
    vi.stubGlobal('fetch', transport())
    await prepareWorkspaceOffline(OFFLINE_ORG)
    setOfflineUser('other-account')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(prepareWorkspaceOffline(OFFLINE_ORG)).rejects.toThrow('Connect once')
  })
})
