import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearSharedFiles,
  readSharedFiles,
  selectFreshFiles,
  type SharedFileEntry,
} from './shared-files'
import { SHARED_FILES_DB, SHARED_FILES_STORE, SHARED_FILES_TTL_MS } from '../../shared/constants'

// -- A minimal in-memory IndexedDB, just the surface shared-files.ts touches.
// The repo ships no IndexedDB fake and prizes a small dependency set, so a
// self-contained fake here keeps the module fully covered without a new
// devDependency. Requests settle on a microtask, as the real API does, so the
// module's `addEventListener('success' | 'error')` handlers run as they would
// in a browser.

class FakeRequest<T> extends EventTarget {
  result: T
  error: DOMException | null = null

  constructor(result: T) {
    super()
    this.result = result
  }
}

class FakeObjectStore {
  readonly #records: unknown[]

  constructor(records: unknown[]) {
    this.#records = records
  }

  getAll(): FakeRequest<unknown[]> {
    const request = new FakeRequest<unknown[]>([...this.#records])
    queueMicrotask(() => request.dispatchEvent(new Event('success')))
    return request
  }

  clear(): FakeRequest<undefined> {
    this.#records.length = 0
    const request = new FakeRequest<undefined>(undefined)
    queueMicrotask(() => request.dispatchEvent(new Event('success')))
    return request
  }
}

class FakeTransaction {
  readonly #stores: Map<string, unknown[]>

  constructor(stores: Map<string, unknown[]>) {
    this.#stores = stores
  }

  objectStore(name: string): FakeObjectStore {
    return new FakeObjectStore(this.#stores.get(name) ?? [])
  }
}

class FakeDatabase {
  readonly #stores: Map<string, unknown[]>

  constructor(stores: Map<string, unknown[]>) {
    this.#stores = stores
  }

  get objectStoreNames(): { contains: (name: string) => boolean } {
    return { contains: (name: string) => this.#stores.has(name) }
  }

  createObjectStore(name: string): void {
    if (!this.#stores.has(name)) {
      this.#stores.set(name, [])
    }
  }

  transaction(): FakeTransaction {
    return new FakeTransaction(this.#stores)
  }

  close(): void {
    // The fake keeps data in the factory, so closing is a no-op.
  }
}

class FakeIndexedDB {
  private readonly databases = new Map<string, Map<string, unknown[]>>()

  failOpen = false

  seed(dbName: string, storeName: string, records: readonly unknown[]): void {
    const stores = this.databases.get(dbName) ?? new Map<string, unknown[]>()
    stores.set(storeName, [...records])
    this.databases.set(dbName, stores)
  }

  read(dbName: string, storeName: string): unknown[] {
    return this.databases.get(dbName)?.get(storeName) ?? []
  }

  open(name: string): FakeRequest<FakeDatabase> {
    const isNewDatabase = !this.databases.has(name)
    const stores = this.databases.get(name) ?? new Map<string, unknown[]>()
    this.databases.set(name, stores)
    const request = new FakeRequest<FakeDatabase>(new FakeDatabase(stores))
    queueMicrotask(() => {
      if (this.failOpen) {
        request.error = new DOMException('open failed', 'UnknownError')
        request.dispatchEvent(new Event('error'))
        return
      }
      if (isNewDatabase) {
        request.dispatchEvent(new Event('upgradeneeded'))
      }
      request.dispatchEvent(new Event('success'))
    })
    return request
  }
}

function imageFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
}

function entry(name: string, savedAt: number): SharedFileEntry {
  return { file: imageFile(name), savedAt }
}

const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
let fake: FakeIndexedDB

beforeEach(() => {
  fake = new FakeIndexedDB()
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fake })
})

afterEach(() => {
  if (originalIndexedDB) {
    Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB)
  } else {
    Reflect.deleteProperty(globalThis, 'indexedDB')
  }
})

describe('selectFreshFiles', () => {
  it('keeps entries within the TTL and drops older ones, preserving order', () => {
    const now = 1000
    const ttl = 400
    const entries = [entry('fresh.png', now), entry('stale.png', now - 500), entry('edge.png', now)]
    expect(selectFreshFiles(entries, now, ttl).map((file) => file.name)).toEqual([
      'fresh.png',
      'edge.png',
    ])
  })

  it('treats an entry at exactly the TTL as expired', () => {
    const now = 1000
    const ttl = 400
    expect(selectFreshFiles([entry('boundary.png', now - ttl)], now, ttl)).toEqual([])
  })
})

describe('readSharedFiles', () => {
  it('returns an empty list and provisions the store when nothing has been shared', async () => {
    expect(await readSharedFiles()).toEqual([])
  })

  it('returns fresh shared files and discards expired and malformed entries', async () => {
    const now = Date.now()
    fake.seed(SHARED_FILES_DB, SHARED_FILES_STORE, [
      entry('recent.png', now),
      entry('expired.png', now - SHARED_FILES_TTL_MS * 2),
      'not-an-object',
      null,
      { savedAt: now },
      { file: 'not-a-file', savedAt: now },
      { file: imageFile('no-timestamp.png') },
    ])
    const files = await readSharedFiles()
    expect(files.map((file) => file.name)).toEqual(['recent.png'])
  })

  it('rejects when the database cannot be opened', async () => {
    fake.failOpen = true
    await expect(readSharedFiles()).rejects.toThrow('open failed')
  })
})

describe('clearSharedFiles', () => {
  it('empties the shared-files store', async () => {
    const now = Date.now()
    fake.seed(SHARED_FILES_DB, SHARED_FILES_STORE, [entry('a.png', now), entry('b.png', now)])
    await clearSharedFiles()
    expect(fake.read(SHARED_FILES_DB, SHARED_FILES_STORE)).toEqual([])
    expect(await readSharedFiles()).toEqual([])
  })
})
