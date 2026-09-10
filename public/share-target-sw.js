/*
 * Web Share Target service worker (M16, Android): scope `/share-target`,
 * registered from src/client/main.tsx. It stashes shared images in IndexedDB
 * and redirects to the bulk tool, which reads them via
 * src/client/lib/shared-files.ts. Not bundled, so the database and store names
 * are duplicated from src/shared/constants.ts; keep them in sync.
 */

const SHARED_FILES_DB = 'watermark-pro-shared'
const SHARED_FILES_STORE = 'pending'
const DB_VERSION = 1
const SHARE_TARGET_PATH = '/share-target'
const SHARED_FILES_FIELD = 'photos'
const BULK_INBOX_URL = '/app/bulk?shared=1'
const SEE_OTHER = 303
const UNAUTHORIZED = 401
const OFFLINE_DB = 'watermark-pro-offline'
const OFFLINE_RECORDS = 'records'
const ACTIVE_ACCOUNT_KEY = 'active-account'

/** An offline share belongs to the last account admitted by the app, never the next sign-in. */
function rememberedAccount() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB)
    request.addEventListener('upgradeneeded', () => {
      // Match the canonical offline database v1 layout if sharing is the first
      // entry point; never leave an empty v1 database that the app cannot open.
      request.result.createObjectStore(OFFLINE_RECORDS, { keyPath: 'key' })
      request.result.createObjectStore('outbox', { keyPath: 'sequence', autoIncrement: true })
    })
    request.addEventListener('success', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(OFFLINE_RECORDS)) {
        database.close()
        resolve(null)
        return
      }
      const read = database
        .transaction(OFFLINE_RECORDS)
        .objectStore(OFFLINE_RECORDS)
        .get(ACTIVE_ACCOUNT_KEY)
      read.addEventListener('success', () => {
        database.close()
        resolve(typeof read.result?.userId === 'string' ? read.result.userId : null)
      })
      read.addEventListener('error', () => {
        database.close()
        reject(read.error)
      })
    })
    request.addEventListener('error', () => reject(request.error))
  })
}

async function shareOwner() {
  const remembered = await rememberedAccount()
  if (remembered === null) return null
  try {
    const response = await fetch('/api/auth/get-session', { cache: 'no-store' })
    if (!response.ok) return null
    const session = await response.json()
    return session?.user?.id === remembered ? remembered : null
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    return remembered
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARED_FILES_DB, DB_VERSION)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SHARED_FILES_STORE)) {
        database.createObjectStore(SHARED_FILES_STORE, { autoIncrement: true })
      }
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error ?? new Error('open failed')))
  })
}

async function storeSharedFiles(files, userId) {
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(SHARED_FILES_STORE, 'readwrite')
      const store = transaction.objectStore(SHARED_FILES_STORE)
      const savedAt = Date.now()
      for (const file of files) {
        store.put({ file, savedAt, userId })
      }
      transaction.addEventListener('complete', () => resolve())
      transaction.addEventListener('error', () =>
        reject(transaction.error ?? new Error('put failed')),
      )
    })
  } finally {
    database.close()
  }
}

async function handleShare(request) {
  const userId = await shareOwner()
  if (userId === null) {
    return new Response('Sign in to Lumafoil, then share these files again.', {
      status: UNAUTHORIZED,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  const formData = await request.formData()
  const files = formData.getAll(SHARED_FILES_FIELD).filter((value) => value instanceof File)
  if (files.length > 0) {
    await storeSharedFiles(files, userId)
  }
  return Response.redirect(BULK_INBOX_URL, SEE_OTHER)
}

addEventListener('install', () => skipWaiting())
addEventListener('activate', (event) => event.waitUntil(clients.claim()))
addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShare(event.request))
  }
})
