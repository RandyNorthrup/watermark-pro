/** Durable workspace cache and outbox. A local save is acknowledged only after transaction commit. */
import {
  decodeOfflineOperation,
  decodeOfflineRecord,
  encodeOfflineOperation,
  encodeOfflineRecord,
} from './offline-binary'
import { captureOfflineOwner, currentOfflineUser } from './offline-context'
import {
  cachedRecordSchema,
  type CachedRecord,
  type NewOperation,
  type PendingOperation,
} from './offline-model'

const DATABASE_NAME = 'watermark-pro-offline'
const DATABASE_VERSION = 1
const RECORDS = 'records'
const OUTBOX = 'outbox'
const ACTIVE_ACCOUNT_KEY = 'active-account'

/** The Share Target worker uses this account-scoped marker when a device has no network. */
export async function rememberOfflineAccount(userId: string): Promise<void> {
  await cacheOfflineRecord({ key: ACTIVE_ACCOUNT_KEY, userId, organizationId: '', value: null })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(RECORDS, { keyPath: 'key' })
      request.result.createObjectStore(OUTBOX, { keyPath: 'sequence', autoIncrement: true })
    })
    request.addEventListener('success', () => {
      const database = request.result
      database.addEventListener('versionchange', () => database.close())
      resolve(database)
    })
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('Offline storage could not open.')),
    )
    request.addEventListener('blocked', () =>
      reject(new Error('Close other Lumafoil tabs to update offline storage.')),
    )
  })
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('Offline storage could not be read.')),
    )
  })
}

async function write(action: (transaction: IDBTransaction) => void): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([RECORDS, OUTBOX], 'readwrite')
      transaction.addEventListener('complete', () => resolve())
      transaction.addEventListener('abort', () =>
        reject(transaction.error ?? new Error('Offline save did not complete.')),
      )
      transaction.addEventListener('error', (event) => {
        const requestError = event.target instanceof IDBRequest ? event.target.error : null
        reject(
          requestError ??
            transaction.error ??
            new Error('Offline save failed. Check available device storage.'),
        )
      })
      try {
        action(transaction)
      } catch (error) {
        transaction.abort()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  } finally {
    database.close()
  }
}

/** Scope is part of the primary key, so equal URLs or ids cannot cross accounts. */
export function offlineRecordKey(userId: string, organizationId: string, name: string): string {
  return JSON.stringify([userId, organizationId, name])
}

/** Read a scoped cache entry; callers validate its value against the endpoint's wire schema. */
export async function readOfflineRecord(key: string): Promise<CachedRecord | null> {
  const database = await openDatabase()
  try {
    const value: unknown = await requestValue(
      database.transaction(RECORDS).objectStore(RECORDS).get(key),
    )
    return value === undefined ? null : decodeOfflineRecord(value)
  } finally {
    database.close()
  }
}

/** Commit a server-confirmed cache record. */
export async function cacheOfflineRecord(record: CachedRecord): Promise<void> {
  const owner = currentOfflineUser() === null ? undefined : captureOfflineOwner()
  const encoded = await encodeOfflineRecord(record)
  owner?.assertCurrent()
  await write((transaction) => {
    owner?.assertCurrent()
    transaction.objectStore(RECORDS).put(encoded)
  })
}

/** Atomically update scoped metadata; binary saves prepare their buffers through cacheOfflineRecord. */
export async function updateOfflineRecord(
  key: string,
  update: (previous: CachedRecord | null) => CachedRecord,
): Promise<void> {
  await write((transaction) => {
    const store = transaction.objectStore(RECORDS)
    const request = store.get(key)
    request.addEventListener('success', () => {
      try {
        const raw: unknown = request.result
        const previous = raw === undefined ? null : decodeOfflineRecord(raw)
        const next = cachedRecordSchema.parse(update(previous))
        if (next.key !== key) throw new Error('An offline update cannot change its record key')
        if (next.value instanceof Blob)
          throw new Error('Use cacheOfflineRecord to prepare binary data before a transaction.')
        store.put(next)
      } catch {
        // Async IDB event callbacks are outside write()'s synchronous catch.
        // Aborting prevents an invalid/update-failed record from committing.
        transaction.abort()
      }
    })
  })
}

/** The outbox row contains both the displayed local value and its future server operation. */
export async function commitOfflineChange(operation: NewOperation): Promise<void> {
  const owner = currentOfflineUser() === null ? undefined : captureOfflineOwner()
  const encoded = await encodeOfflineOperation(operation)
  owner?.assertCurrent()
  await write((transaction) => {
    owner?.assertCurrent()
    transaction.objectStore(OUTBOX).add(encoded)
  })
}

/** Operations are read in monotonically allocated transaction order, including across tabs. */
export async function offlineOperations(userId: string): Promise<PendingOperation[]> {
  const database = await openDatabase()
  try {
    const value: unknown = await requestValue(
      database.transaction(OUTBOX).objectStore(OUTBOX).getAll(),
    )
    if (!Array.isArray(value)) throw new Error('Invalid offline operation list')
    return value
      .map((item: unknown) => decodeOfflineOperation(item))
      .filter((item) => item.userId === userId)
  } finally {
    database.close()
  }
}

/** Server-confirmed entries remain local for offline reading but never replay. */
export async function pendingOperations(userId: string): Promise<PendingOperation[]> {
  const operations = await offlineOperations(userId)
  return operations.filter((operation) => operation.state !== 'synced')
}

/** A failed operation stays durable until it is retried or explicitly discarded. */
export async function updatePendingOperation(operation: PendingOperation): Promise<void> {
  const owner = currentOfflineUser() === null ? undefined : captureOfflineOwner()
  const encoded = await encodeOfflineOperation(operation)
  owner?.assertCurrent()
  await write((transaction) => {
    owner?.assertCurrent()
    transaction.objectStore(OUTBOX).put(encoded)
  })
}

/** Explicitly discard a resolved or unwanted local operation. */
export async function discardOfflineOperation(sequence: number): Promise<void> {
  await write((transaction) => {
    transaction.objectStore(OUTBOX).delete(sequence)
  })
}

/** Move acknowledged media to the cache and retire its journal row in one transaction. */
export async function retireOfflineOperations(
  sequences: number[],
  records: CachedRecord[],
  removedKeys: string[],
): Promise<void> {
  const owner = currentOfflineUser() === null ? undefined : captureOfflineOwner()
  const encodedRecords = await Promise.all(records.map((record) => encodeOfflineRecord(record)))
  owner?.assertCurrent()
  await write((transaction) => {
    owner?.assertCurrent()
    const cache = transaction.objectStore(RECORDS)
    for (const record of encodedRecords) {
      cache.put(record)
    }
    for (const key of removedKeys) {
      cache.delete(key)
    }
    for (const sequence of sequences) {
      transaction.objectStore(OUTBOX).delete(sequence)
    }
  })
}

/** Full test/device reset; normal sign-out uses the account-scoped deletion below. */
export async function clearOfflineDatabase(): Promise<void> {
  await write((transaction) => {
    transaction.objectStore(RECORDS).clear()
    transaction.objectStore(OUTBOX).clear()
  })
}

/** Remove only the exiting account; a new save from another tab must survive sign-out. */
export async function clearOfflineAccountData(
  userId: string,
): Promise<{ hasPendingWork: boolean }> {
  let hasPendingWork = false
  await write((transaction) => {
    const outbox = transaction.objectStore(OUTBOX).openCursor()
    outbox.addEventListener('success', () => {
      const cursor = outbox.result
      if (cursor === null) {
        eraseAccountRows(transaction, userId)
        return
      }
      const row: unknown = cursor.value
      if (
        typeof row === 'object' &&
        row !== null &&
        'userId' in row &&
        row.userId === userId &&
        (!('state' in row) || row.state !== 'synced')
      ) {
        hasPendingWork = true
        const records = transaction.objectStore(RECORDS)
        const marker = records.get(ACTIVE_ACCOUNT_KEY)
        marker.addEventListener('success', () => {
          const value: unknown = marker.result
          if (
            typeof value === 'object' &&
            value !== null &&
            'userId' in value &&
            value.userId === userId
          )
            records.delete(ACTIVE_ACCOUNT_KEY)
        })
        return
      }
      cursor.continue()
    })
  })
  return { hasPendingWork }
}

function eraseAccountRows(transaction: IDBTransaction, userId: string): void {
  for (const name of [RECORDS, OUTBOX]) {
    const request = transaction.objectStore(name).openCursor()
    request.addEventListener('success', () => {
      const cursor = request.result
      if (cursor === null) return
      const row: unknown = cursor.value
      if (typeof row === 'object' && row !== null && 'userId' in row && row.userId === userId)
        cursor.delete()
      cursor.continue()
    })
  }
}

/** Preserve this account's durable saves; refuse to erase another account's unresolved work. */
export async function clearOtherOfflineAccounts(userId: string): Promise<void> {
  await write((transaction) => {
    for (const storeName of [RECORDS, OUTBOX]) {
      const request = transaction.objectStore(storeName).openCursor()
      request.addEventListener('success', () => {
        const cursor = request.result
        if (cursor === null) {
          return
        }
        try {
          const row =
            storeName === OUTBOX
              ? decodeOfflineOperation(cursor.value)
              : decodeOfflineRecord(cursor.value)
          if (row.userId !== userId) {
            if ('state' in row && row.state !== 'synced') {
              transaction.abort()
              return
            }
            cursor.delete()
          }
          cursor.continue()
        } catch {
          transaction.abort()
        }
      })
    }
  })
}
