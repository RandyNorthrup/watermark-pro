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

async function storeSharedFiles(files) {
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(SHARED_FILES_STORE, 'readwrite')
      const store = transaction.objectStore(SHARED_FILES_STORE)
      const savedAt = Date.now()
      for (const file of files) {
        store.put({ file, savedAt })
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
  const formData = await request.formData()
  const files = formData.getAll(SHARED_FILES_FIELD).filter((value) => value instanceof File)
  if (files.length > 0) {
    await storeSharedFiles(files)
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
