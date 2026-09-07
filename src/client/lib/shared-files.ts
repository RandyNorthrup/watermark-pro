/**
 * Web Share Target inbound files (M16, Android). The service worker in
 * public/share-target-sw.js stores each shared image in IndexedDB as it arrives;
 * the bulk route reads them on load and clears the store once it owns them.
 *
 * The freshness rule (`selectFreshFiles`) is separated from the IndexedDB
 * plumbing so it can be unit-tested without a database. Stored entries older
 * than SHARED_FILES_TTL_MS are treated as abandoned and never surfaced.
 */

import { SHARED_FILES_DB, SHARED_FILES_STORE, SHARED_FILES_TTL_MS } from '../../shared/constants'

/** Schema version of the shared-files object store; bump on store-shape changes. */
const DB_VERSION = 1

/** One shared image with the epoch millisecond it was received by the service worker. */
export interface SharedFileEntry {
  readonly file: File
  readonly savedAt: number
}

/**
 * Pure selection: the files from `entries` still within `ttlMs` of `now`, in the
 * order they were stored. Entries at or past the TTL are discarded.
 */
export function selectFreshFiles(
  entries: readonly SharedFileEntry[],
  now: number,
  ttlMs: number,
): File[] {
  return entries.filter((entry) => now - entry.savedAt < ttlMs).map((entry) => entry.file)
}

/** Runtime guard: IndexedDB hands back `unknown`, so validate the stored shape before use. */
function isSharedFileEntry(value: unknown): value is SharedFileEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'file' in value &&
    value.file instanceof File &&
    'savedAt' in value &&
    typeof value.savedAt === 'number'
  )
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result)
    })
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('The shared-files database request failed'))
    })
  })
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(SHARED_FILES_DB, DB_VERSION)
  request.addEventListener('upgradeneeded', () => {
    const database = request.result
    if (!database.objectStoreNames.contains(SHARED_FILES_STORE)) {
      database.createObjectStore(SHARED_FILES_STORE, { autoIncrement: true })
    }
  })
  return promisifyRequest(request)
}

/** Fresh shared images waiting in IndexedDB; stale ones are filtered out. */
export async function readSharedFiles(): Promise<File[]> {
  if (typeof indexedDB === 'undefined') {
    return []
  }
  const database = await openDatabase()
  try {
    const transaction = database.transaction(SHARED_FILES_STORE, 'readonly')
    const store = transaction.objectStore(SHARED_FILES_STORE)
    const request: IDBRequest<unknown[]> = store.getAll()
    const rows = await promisifyRequest(request)
    const entries = rows.filter(isSharedFileEntry)
    return selectFreshFiles(entries, Date.now(), SHARED_FILES_TTL_MS)
  } finally {
    database.close()
  }
}

/** Empties the shared-files store; called once the bulk route has taken ownership. */
export async function clearSharedFiles(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return
  }
  const database = await openDatabase()
  try {
    const transaction = database.transaction(SHARED_FILES_STORE, 'readwrite')
    const store = transaction.objectStore(SHARED_FILES_STORE)
    await promisifyRequest(store.clear())
  } finally {
    database.close()
  }
}
