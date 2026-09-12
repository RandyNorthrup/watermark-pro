/** The shipped service-worker script runs against an observable Cache API and lifecycle harness. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

const ORIGIN = 'https://lumafoil.example'
const CACHE_NAME = 'watermark-pro-offline-v3'
const script = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

interface ScriptEvent {
  request?: { method: string; url: string; mode: string }
  data?: { type: string; build?: string }
  source?: { id: string; postMessage: (value: unknown) => void }
  waitUntil: (promise: Promise<unknown>) => void
  respondWith: (promise: Promise<Response>) => void
}

function harness() {
  const listeners = new Map<string, (event: ScriptEvent) => void>()
  const buckets = new Map<string, Map<string, Response>>()
  const windows = [{ id: 'current-tab' }]
  const network = vi.fn((request: string | { url: string }) =>
    Promise.resolve(new Response(typeof request === 'string' ? request : request.url)),
  )
  function key(request: string | { url: string }) {
    return new URL(typeof request === 'string' ? request : request.url, ORIGIN).href
  }
  function open(name: string) {
    const entries = buckets.get(name) ?? new Map<string, Response>()
    buckets.set(name, entries)
    return Promise.resolve({
      match: (request: string | { url: string }) =>
        Promise.resolve(entries.get(key(request))?.clone()),
      put: (request: string | { url: string }, response: Response) => {
        entries.set(key(request), response)
        return Promise.resolve()
      },
      addAll: async (requests: string[]) => {
        for (const request of requests) entries.set(key(request), await network(request))
      },
    })
  }
  const skipWaiting = vi.fn(() => Promise.resolve())
  const claim = vi.fn(() => Promise.resolve())
  runInNewContext(script, {
    addEventListener: (name: string, callback: (event: ScriptEvent) => void) =>
      listeners.set(name, callback),
    fetch: network,
    Response,
    URL,
    location: { origin: ORIGIN },
    caches: {
      open,
      keys: () => Promise.resolve(buckets.keys().toArray()),
      delete: (name: string) => Promise.resolve(buckets.delete(name)),
    },
    clients: { matchAll: () => Promise.resolve(windows), claim },
    skipWaiting,
  })
  async function dispatch(name: string, data: Omit<ScriptEvent, 'waitUntil' | 'respondWith'> = {}) {
    const pending: Promise<unknown>[] = []
    let response: Promise<Response> | undefined
    listeners.get(name)?.({
      ...data,
      waitUntil: (value) => {
        pending.push(value)
      },
      respondWith: (value) => {
        response = value
      },
    })
    await Promise.all(pending)
    return await response
  }
  return { buckets, network, open, windows, skipWaiting, claim, dispatch }
}

describe('offline service worker', () => {
  it('never caches or substitutes an application shell for OAuth callbacks', async () => {
    const worker = harness()
    const cache = await worker.open(CACHE_NAME)
    await cache.put('/offline-shell', new Response('private cached application'))
    worker.network.mockRejectedValue(new TypeError('Offline'))
    for (const path of [
      '/oauth/microsoft?code=private-code',
      '/oauth/microsoft-bridge.js',
      '/oauth/dropbox?code=private-code',
    ]) {
      const response = await worker.dispatch('fetch', {
        request: { method: 'GET', mode: 'navigate', url: `${ORIGIN}${path}` },
      })
      expect(response).toBeUndefined()
    }
    expect(worker.network).not.toHaveBeenCalled()
    expect(worker.buckets.get(CACHE_NAME)?.size).toBe(1)
  })
  it('prepares the complete inventory and waits for an explicit update request', async () => {
    const worker = harness()
    const inventory = [
      '/offline-shell',
      '/favicon.svg',
      '/fonts/sample.woff2',
      '/stickers/flower.svg',
    ]
    worker.network.mockImplementation((request) =>
      Promise.resolve(
        request === '/offline-manifest.json'
          ? Response.json(inventory)
          : new Response('asset bytes'),
      ),
    )
    await worker.dispatch('install')
    expect([...(worker.buckets.get(CACHE_NAME)?.keys() ?? [])]).toEqual(
      inventory.map((path) => `${ORIGIN}${path}`),
    )
    expect(worker.skipWaiting).not.toHaveBeenCalled()
    await worker.dispatch('message', { data: { type: 'activate-update' } })
    expect(worker.skipWaiting).toHaveBeenCalledOnce()
    await worker.dispatch('activate')
    expect(worker.claim).toHaveBeenCalledOnce()
  })

  it('never stores navigation URLs containing invitation or sharing secrets in the public cache', async () => {
    const worker = harness()
    for (const path of [
      '/accept-invitation/private-token-canary',
      '/share/private-share-canary?secret=canary',
    ]) {
      const response = await worker.dispatch('fetch', {
        request: { method: 'GET', mode: 'navigate', url: `${ORIGIN}${path}` },
      })
      expect(await response?.text()).toBe(`${ORIGIN}${path}`)
    }
    expect([...(worker.buckets.get(CACHE_NAME)?.keys() ?? [])]).toEqual([])
  })

  it('uses the public shell offline without caching API, cross-origin, or mutation requests', async () => {
    const worker = harness()
    const cache = await worker.open(CACHE_NAME)
    await cache.put('/offline-shell', new Response('<main>Offline shell</main>'))
    worker.network.mockRejectedValue(new TypeError('Offline'))
    const response = await worker.dispatch('fetch', {
      request: { method: 'GET', mode: 'navigate', url: `${ORIGIN}/app/editor` },
    })
    expect(await response?.text()).toBe('<main>Offline shell</main>')
    for (const request of [
      { method: 'GET', mode: 'cors', url: `${ORIGIN}/api/orgs/private/photos` },
      { method: 'POST', mode: 'cors', url: `${ORIGIN}/app/editor` },
      { method: 'GET', mode: 'cors', url: 'https://other.example/assets/private.js' },
    ])
      expect(await worker.dispatch('fetch', { request })).toBeUndefined()
    expect(worker.network).toHaveBeenCalledOnce()
  })

  it('serves static icons, fonts, stickers and photography from the prepared cache while offline', async () => {
    const worker = harness()
    const cache = await worker.open(CACHE_NAME)
    const paths = [
      '/favicon.svg',
      '/fonts/sample.woff2',
      '/stickers/flower.svg',
      '/photography/coast-480.webp',
    ]
    for (const path of paths) await cache.put(path, new Response(path))
    worker.network.mockRejectedValue(new TypeError('Offline'))
    for (const path of paths) {
      const response = await worker.dispatch('fetch', {
        request: { method: 'GET', mode: 'cors', url: `${ORIGIN}${path}` },
      })
      expect(await response?.text()).toBe(path)
    }
    expect(worker.network).not.toHaveBeenCalled()
  })

  it('retains old assets for a second tab and retires them only after the sole current client confirms readiness', async () => {
    const worker = harness()
    await worker.open('watermark-pro-offline-old')
    await worker.open('unrelated-cache')
    worker.windows.push({ id: 'older-tab' })
    const event = {
      data: { type: 'client-ready', build: CACHE_NAME },
      source: { id: 'current-tab', postMessage: vi.fn() },
    }
    await worker.dispatch('message', event)
    expect(worker.buckets.has('watermark-pro-offline-old')).toBe(true)
    worker.windows.pop()
    await worker.dispatch('message', event)
    expect(worker.buckets.has('watermark-pro-offline-old')).toBe(false)
    expect(worker.buckets.has('unrelated-cache')).toBe(true)
  })

  it('refuses incomplete or private offline inventories', async () => {
    for (const inventory of [
      [],
      ['/api/private'],
      ['/oauth/microsoft'],
      ['//other.example/asset'],
      ['relative.js'],
    ]) {
      const worker = harness()
      worker.network.mockResolvedValue(Response.json(inventory))
      await expect(worker.dispatch('install')).rejects.toThrow('Invalid offline asset inventory')
    }
    const worker = harness()
    worker.network.mockResolvedValue(new Response('Missing', { status: 404 }))
    await expect(worker.dispatch('install')).rejects.toThrow('inventory is unavailable')
  })
})
