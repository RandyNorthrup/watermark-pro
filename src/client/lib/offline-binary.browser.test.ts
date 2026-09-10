import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setOfflineUser } from './offline-context'
import {
  cacheOfflineRecord,
  clearOfflineDatabase,
  clearOtherOfflineAccounts,
  commitOfflineChange,
  offlineOperations,
  offlineRecordKey,
  readOfflineRecord,
  retireOfflineOperations,
  updatePendingOperation,
} from './offline-database'
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
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('portable durable media', () => {
  it('commits complete photos and thumbnails, updates their state, then retires into readable media cache', async () => {
    const photo = offlinePhoto()
    const original = new Blob([new Uint8Array([0, 128, 255])], { type: 'image/png' })
    const thumbnail = new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' })
    await commitOfflineChange(
      offlineOperation({ kind: 'photo-upload', photo, blob: original, thumbnail }),
    )
    const [pending] = await offlineOperations(OFFLINE_USER)
    if (pending?.change.kind !== 'photo-upload') throw new Error('Expected saved photo')
    expect(pending.change.blob.type).toBe(original.type)
    expect(pending.change.thumbnail.size).toBe(2)
    const bytes = await pending.change.blob.arrayBuffer()
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([0, 128, 255]))
    await updatePendingOperation({ ...pending, state: 'synced' })
    const key = offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, 'photo-file')
    await retireOfflineOperations(
      [pending.sequence],
      [{ key, userId: OFFLINE_USER, organizationId: OFFLINE_ORG, value: pending.change.blob }],
      [],
    )
    expect(await offlineOperations(OFFLINE_USER)).toEqual([])
    const cached = await readOfflineRecord(key)
    if (!(cached?.value instanceof Blob)) throw new Error('Expected cached media')
    const cachedBytes = await cached.value.arrayBuffer()
    expect(new Uint8Array(cachedBytes)).toEqual(new Uint8Array([0, 128, 255]))
    await clearOtherOfflineAccounts('another-user')
    expect(await readOfflineRecord(key)).toBeNull()
  })

  it('refuses to discard another owner’s pending binary upload on account switch', async () => {
    const asset = offlineAsset()
    await commitOfflineChange(
      offlineOperation({
        kind: 'logo-upload',
        asset,
        blob: new Blob(['logo'], { type: 'image/png' }),
      }),
    )
    await expect(clearOtherOfflineAccounts('another-user')).rejects.toThrow()
    const saved = await offlineOperations(OFFLINE_USER)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.change.kind).toBe('logo-upload')
  })

  it('does not write stale media when the account changes during binary preparation', async () => {
    const deferred = Promise.withResolvers<ArrayBuffer>()
    const image = new Blob(['private'], { type: 'image/png' })
    vi.spyOn(image, 'arrayBuffer').mockReturnValue(deferred.promise)
    const key = offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, 'stale-image')
    const saving = cacheOfflineRecord({
      key,
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: image,
    })
    setOfflineUser('another-user')
    setOfflineUser(OFFLINE_USER)
    deferred.resolve(new ArrayBuffer(1))
    await expect(saving).rejects.toThrow('account changed')
    expect(await readOfflineRecord(key)).toBeNull()
  })
})
