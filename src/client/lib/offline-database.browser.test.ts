import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cacheOfflineRecord,
  clearOfflineDatabase,
  commitOfflineChange,
  discardOfflineOperation,
  offlineOperations,
  offlineRecordKey,
  pendingOperations,
  readOfflineRecord,
  updatePendingOperation,
} from './offline-database'
import type { NewOperation } from './offline-model'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'

const USER = 'offline-test-user'
const ORG = 'offline-test-org'
const record = {
  key: offlineRecordKey(USER, ORG, 'presets'),
  userId: USER,
  organizationId: ORG,
  value: ['original'],
}

function operation(): NewOperation {
  const id = crypto.randomUUID()
  return {
    id,
    userId: USER,
    organizationId: ORG,
    state: 'pending',
    error: null,
    change: {
      kind: 'preset-create',
      preset: {
        id,
        organizationId: ORG,
        name: 'Local preset',
        spec: DEFAULT_TEXT_SPEC,
        createdBy: USER,
        createdAt: '2026-09-08T00:00:00Z',
        updatedAt: '2026-09-08T00:00:00Z',
      },
    },
  }
}

beforeEach(async () => {
  await clearOfflineDatabase()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('durable offline database', () => {
  it('commits the complete pending save across independent database connections', async () => {
    expect(await readOfflineRecord(record.key)).toBeNull()
    const queued = operation()
    await commitOfflineChange(queued)
    const pending = await pendingOperations(USER)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(queued.id)
    expect(await pendingOperations('another-user')).toEqual([])
    expect(await readOfflineRecord(offlineRecordKey('another-user', ORG, 'presets'))).toBeNull()
  })

  it('does not acknowledge or queue a save when storage fails', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    await expect(commitOfflineChange(operation())).rejects.toThrow('Storage full')
    expect(await readOfflineRecord(record.key)).toBeNull()
    expect(await pendingOperations(USER)).toEqual([])
  })

  it('round-trips binary data without stringifying it', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    await cacheOfflineRecord({ ...record, value: new Blob([bytes], { type: 'image/png' }) })
    const stored = await readOfflineRecord(record.key)
    expect(stored?.value).toBeInstanceOf(Blob)
    if (!(stored?.value instanceof Blob)) {
      throw new TypeError('Expected a stored Blob')
    }
    expect(new Uint8Array(await stored.value.arrayBuffer())).toEqual(bytes)
  })

  it('keeps acknowledged work locally without replaying it and discards only the requested operation', async () => {
    await commitOfflineChange(operation())
    await commitOfflineChange(operation())
    const [first, second] = await pendingOperations(USER)
    if (first === undefined || second === undefined) {
      throw new Error('Expected two durable operations')
    }
    expect(second.sequence).toBeGreaterThan(first.sequence)
    await updatePendingOperation({ ...first, state: 'synced' })
    expect(await pendingOperations(USER)).toEqual([second])
    expect(await offlineOperations(USER)).toHaveLength(2)
    await discardOfflineOperation(second.sequence)
    expect(await pendingOperations(USER)).toEqual([])
    expect(await offlineOperations(USER)).toHaveLength(1)
    await clearOfflineDatabase()
    expect(await offlineOperations(USER)).toEqual([])
    expect(await readOfflineRecord(record.key)).toBeNull()
  })
})
