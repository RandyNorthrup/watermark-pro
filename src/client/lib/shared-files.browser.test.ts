/** Real IndexedDB ownership and transaction completion for the operating-system Share Target inbox. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureOfflineOwner, setOfflineUser } from './offline-context'
import { clearSharedFiles, consumeSharedFiles, readSharedFiles } from './shared-files'
import { SHARED_FILES_DB, SHARED_FILES_STORE, SHARED_FILES_TTL_MS } from '../../shared/constants'

const OWNER = 'share-owner'
const OTHER = 'other-account'

async function seed(entries: unknown[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(SHARED_FILES_DB)
    request.addEventListener('success', () => {
      const database = request.result
      const transaction = database.transaction(SHARED_FILES_STORE, 'readwrite')
      for (const entry of entries) transaction.objectStore(SHARED_FILES_STORE).put(entry)
      transaction.addEventListener('complete', () => {
        database.close()
        resolve()
      })
      transaction.addEventListener('error', () => {
        database.close()
        reject(transaction.error ?? new Error('Fixture could not be saved'))
      })
    })
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('Fixture storage did not open')),
    )
  })
}

function entry(name: string, userId: string, savedAt = Date.now()) {
  return { userId, file: new File(['bytes'], name, { type: 'image/png' }), savedAt }
}

beforeEach(async () => {
  setOfflineUser(OWNER)
  await clearSharedFiles(OWNER)
  await clearSharedFiles(OTHER)
})
afterEach(() => vi.restoreAllMocks())

describe('Share Target inbox', () => {
  it('preserves B when a delayed cleanup from A completes and consumes only the captured owner', async () => {
    await seed([entry('from-a.png', OWNER), entry('from-b.png', OTHER)])
    setOfflineUser(OTHER)
    await clearSharedFiles(OWNER)
    const owner = captureOfflineOwner()
    const consumed = await consumeSharedFiles(owner.userId, owner.assertCurrent)
    expect(consumed.map((file) => file.name)).toEqual(['from-b.png'])
    expect(await readSharedFiles()).toEqual([])
    setOfflineUser(OWNER)
    expect(await readSharedFiles()).toEqual([])
  })

  it('rolls back stale consumption without deleting files after the account changes away and back', async () => {
    await seed([entry('keep.png', OWNER)])
    const owner = captureOfflineOwner()
    const consuming = consumeSharedFiles(owner.userId, owner.assertCurrent)
    setOfflineUser(OTHER)
    setOfflineUser(OWNER)
    await expect(consuming).rejects.toThrow('account changed')
    const files = await readSharedFiles()
    expect(files.map((file) => file.name)).toEqual(['keep.png'])
  })
  it('returns only the current account files and refuses unowned legacy entries', async () => {
    await seed([
      entry('mine.png', OWNER),
      entry('someone-else.png', OTHER),
      { file: new File(['secret'], 'legacy.png'), savedAt: Date.now() },
    ])
    const ownFiles = await readSharedFiles()
    expect(ownFiles.map((file) => file.name)).toEqual(['mine.png'])
    setOfflineUser(OTHER)
    const otherFiles = await readSharedFiles()
    expect(otherFiles.map((file) => file.name)).toEqual(['someone-else.png'])
  })
  it('discards expired, malformed and future entries without revealing their bytes', async () => {
    await seed([
      entry('fresh.png', OWNER),
      entry('expired.png', OWNER, Date.now() - SHARED_FILES_TTL_MS),
      entry('future.png', OWNER, Date.now() + SHARED_FILES_TTL_MS),
      null,
      'invalid',
      { savedAt: Date.now(), userId: OWNER },
    ])
    const freshFiles = await readSharedFiles()
    expect(freshFiles.map((file) => file.name)).toEqual(['fresh.png'])
  })
  it('does not admit files without an active account', async () => {
    await seed([entry('mine.png', OWNER)])
    setOfflineUser(null)
    await expect(readSharedFiles()).rejects.toThrow('Sign in')
  })
  it('waits for the clear transaction before acknowledging an empty inbox', async () => {
    await seed([entry('one.png', OWNER), entry('two.png', OWNER)])
    await clearSharedFiles(OWNER)
    expect(await readSharedFiles()).toEqual([])
  })
  it('surfaces storage failures rather than pretending to consume incoming files', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    })
    await expect(readSharedFiles()).rejects.toThrow('Storage unavailable')
    await expect(clearSharedFiles(OWNER)).rejects.toThrow('Storage unavailable')
  })
})
