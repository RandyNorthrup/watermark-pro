/*
 * Offline service worker (M19), scope `/`, registered by the mounted OfflinePanel
 * when production-build metadata is present. Offline readiness requires the
 * complete static inventory and the account's workspace preparation. Hashed
 * assets are immutable, and navigations use a network-first static-shell fallback
 * so a prepared editor can reload offline. This worker never caches the API.
 *
 * The Web Share Target worker (public/share-target-sw.js) keeps its own narrow
 * `/share-target` scope and is untouched by this one (a more specific scope
 * wins), so shared photos still reach the bulk tool.
 *
 * Updates wait for an explicit reload. Old caches remain while other tabs use
 * them. Only the static shell is cached: navigation URLs may contain private
 * invitation or sharing tokens and must never become shared cache keys.
 * Not bundled, so the few
 * constants below are literals rather than imports.
 */
const CACHE_NAME = 'watermark-pro-offline-v2'
const ASSET_PREFIX = '/assets/'
const FONT_PREFIX = '/fonts/'
const STICKER_PREFIX = '/stickers/'
const PRODUCT_PREFIX = '/product/'
const PHOTOGRAPHY_PREFIX = '/photography/'
const API_PREFIX = '/api/'
const OAUTH_PREFIX = '/oauth/'
const OFFLINE_FALLBACK = '/offline-shell'
const STATIC_ASSETS = new Set([
  '/sample-scene.jpg',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
])
const DOWNLOAD_CONCURRENCY = 6

/** Bound download concurrency so the full font library cannot monopolize page loading. */
async function cacheInventory(cache, assets) {
  let next = 0
  async function download() {
    while (next < assets.length) {
      const asset = assets[next]
      next += 1
      const response = await fetch(asset, { cache: 'reload' })
      if (!response.ok) {
        throw new Error('An offline asset could not be downloaded')
      }
      await cache.put(asset, response)
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, assets.length) }, download))
}

addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch('/offline-manifest.json', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Offline asset inventory is unavailable')
      }
      const assets = await response.json()
      if (
        !Array.isArray(assets) ||
        assets.length === 0 ||
        assets.some(
          (asset) =>
            typeof asset !== 'string' ||
            !asset.startsWith('/') ||
            asset.startsWith('//') ||
            asset.startsWith(API_PREFIX) ||
            asset.startsWith(OAUTH_PREFIX),
        )
      ) {
        throw new Error('Invalid offline asset inventory')
      }
      const cache = await caches.open(CACHE_NAME)
      await cacheInventory(cache, assets)
    })(),
  )
})

addEventListener('message', (event) => {
  if (event.data?.type === 'get-build') {
    event.source?.postMessage({ type: 'offline-build', build: CACHE_NAME })
  }
  if (event.data?.type === 'activate-update') {
    skipWaiting()
  }
  if (event.data?.type === 'client-ready' && event.data.build === CACHE_NAME) {
    event.waitUntil(
      (async () => {
        const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
        // A second tab may still run an old build with unsaved edits. Only the
        // sole, confirmed-current client permits retiring older asset caches.
        if (windows.length !== 1 || windows[0].id !== event.source?.id) {
          return
        }
        const names = await caches.keys()
        await Promise.all(
          names
            .filter((name) => name.startsWith('watermark-pro-offline-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        )
      })(),
    )
  }
})

addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await clients.claim()
    })(),
  )
})

/** Hashed build assets are immutable by URL, so serve them from the cache first. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  // Vite's preview adds Vary: Origin. A module request has a different Origin
  // header from install-time precaching, but these same-origin, hashed files
  // are identical for every request and must remain usable offline.
  const cached = await cache.match(request, { ignoreVary: true })
  if (cached !== undefined) {
    return cached
  }
  const names = await caches.keys()
  for (const name of names) {
    if (name === CACHE_NAME || !name.startsWith('watermark-pro-offline-')) {
      continue
    }
    const previous = await caches.open(name)
    const oldAsset = await previous.match(request, { ignoreVary: true })
    if (oldAsset !== undefined) {
      return oldAsset
    }
  }
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
  }
  return response
}

/** HTML navigations: try the network, fall back to the cache when offline. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    return response
  } catch (error) {
    const cached = await cache.match(OFFLINE_FALLBACK, { ignoreVary: true })
    if (cached !== undefined) {
      // Static Assets may canonicalize /index.html through redirects. Navigation
      // requests use manual redirects and refuse a cached redirected response;
      // a fresh response preserves the document while removing redirect state.
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
      })
    }
    throw error
  }
}

addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  // Only same-origin requests, and never the API (dynamic, authenticated).
  if (
    url.origin !== location.origin ||
    url.pathname.startsWith(API_PREFIX) ||
    url.pathname.startsWith(OAUTH_PREFIX)
  ) {
    return
  }
  if (
    url.pathname.startsWith(ASSET_PREFIX) ||
    url.pathname.startsWith(FONT_PREFIX) ||
    url.pathname.startsWith(STICKER_PREFIX) ||
    url.pathname.startsWith(PRODUCT_PREFIX) ||
    url.pathname.startsWith(PHOTOGRAPHY_PREFIX) ||
    STATIC_ASSETS.has(url.pathname)
  ) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
  }
})
