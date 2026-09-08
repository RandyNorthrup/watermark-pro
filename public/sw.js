/*
 * Offline service worker (M19), scope `/`, registered from src/client/main.tsx
 * in production only. It makes the installed app usable without a network once
 * it has been visited: hashed build assets are cached forever (they are
 * immutable by name), and navigations are served network-first with a cached
 * fallback, so a reload of the editor works offline. The API is never cached.
 *
 * The Web Share Target worker (public/share-target-sw.js) keeps its own narrow
 * `/share-target` scope and is untouched by this one (a more specific scope
 * wins), so shared photos still reach the bulk tool.
 *
 * Updates: a new deploy ships fresh, network-first HTML that references new
 * hashed assets, so there is no stale-asset problem; skipWaiting + clients.claim
 * let the new worker take over on the next navigation. Not bundled, so the few
 * constants below are literals rather than imports.
 */
const CACHE_NAME = 'watermark-pro-offline-v1'
const ASSET_PREFIX = '/assets/'
const API_PREFIX = '/api/'
const OFFLINE_FALLBACK = '/index.html'

addEventListener('install', () => {
  // Nothing is precached: assets are cached as they are first requested. Take
  // over as soon as installed so an update applies on the next navigation.
  skipWaiting()
})

addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older worker versions.
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      )
      await clients.claim()
    })(),
  )
})

/** Hashed build assets are immutable by URL, so serve them from the cache first. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached !== undefined) {
    return cached
  }
  const response = await fetch(request)
  if (response.ok) {
    cache.put(request, response.clone())
  }
  return response
}

/** HTML navigations: try the network, fall back to the cache when offline. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = (await cache.match(request)) ?? (await cache.match(OFFLINE_FALLBACK))
    if (cached !== undefined) {
      return cached
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
  if (url.origin !== location.origin || url.pathname.startsWith(API_PREFIX)) {
    return
  }
  if (url.pathname.startsWith(ASSET_PREFIX)) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
  }
})
