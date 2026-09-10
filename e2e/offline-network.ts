/** WebKit's offline toggle disables SW cache delivery; a real per-context network outage preserves it. */
import type { Route } from '@playwright/test'

import { PREVIEW_ORIGIN } from './preview'
import { expect, test as base } from './support'
import {
  createOfflineProxy,
  type OfflineProxy,
  type PhotoAcknowledgementLoss,
} from '../scripts/lib/offline-proxy.mjs'

interface OfflineNetwork {
  setOffline(isOffline: boolean): Promise<void>
  createObserver(): Promise<{ put(path: string, data: unknown): Promise<number> }>
  loseNextPhotoAcknowledgement(path: string): Promise<PhotoAcknowledgementLoss>
}

/** Only specs importing this fixture receive the WebKit proxy; Chromium keeps native offline emulation. */
export const test = base.extend<{
  outageProxy: OfflineProxy | null
  offlineNetwork: OfflineNetwork
}>({
  outageProxy: async ({ browserName }, provide) => {
    const proxy = browserName === 'webkit' ? await createOfflineProxy(PREVIEW_ORIGIN) : null
    try {
      await provide(proxy)
    } finally {
      await proxy?.close()
    }
  },
  proxy: async ({ outageProxy }, provide) => {
    await provide(outageProxy === null ? undefined : { server: outageProxy.origin, bypass: '' })
  },
  offlineNetwork: async ({ context, outageProxy }, provide) => {
    await provide({
      async createObserver() {
        // Playwright applies its test proxy defaults to APIRequestContext too.
        // Node fetch provides the independent client with this account's actual cookie.
        const cookies = await context.cookies(PREVIEW_ORIGIN)
        const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
        return {
          async put(path, data) {
            const url = new URL(path, PREVIEW_ORIGIN)
            if (
              url.origin !== PREVIEW_ORIGIN ||
              url.username !== '' ||
              url.password !== '' ||
              url.hash !== ''
            )
              throw new Error('The offline observer can only write to its local gate.')
            const response = await fetch(url, {
              method: 'PUT',
              redirect: 'manual',
              headers: { origin: PREVIEW_ORIGIN, cookie, 'content-type': 'application/json' },
              body: JSON.stringify(data),
            })
            await response.arrayBuffer()
            return response.status
          },
        }
      },
      async loseNextPhotoAcknowledgement(path) {
        if (outageProxy !== null) return outageProxy.dropNextPhotoAcknowledgement(path)
        const page = context.pages().find((candidate) => !candidate.isClosed())
        if (page === undefined) throw new Error('Acknowledgement proof requires its live page.')
        const evidence = { responseStatus: null as number | null, didDrop: false }
        let hasIntercepted = false
        const pattern = `**${path}`
        const handler = async (route: Route) => {
          if (!hasIntercepted && route.request().method() === 'POST') {
            hasIntercepted = true
            const response = await route.fetch()
            evidence.responseStatus = response.status()
            expect(evidence.responseStatus).toBe(201)
            await route.abort('failed')
            evidence.didDrop = true
            return
          }
          await route.continue()
        }
        await page.route(pattern, handler)
        return {
          get responseStatus() {
            return evidence.responseStatus
          },
          get didDrop() {
            return evidence.didDrop
          },
          async clear() {
            await page.unroute(pattern, handler)
          },
        }
      },
      async setOffline(value) {
        if (outageProxy === null) {
          await context.setOffline(value)
        } else {
          expect(
            outageProxy.forwardedRequests,
            'WebKit must use its configured proxy',
          ).toBeGreaterThan(0)
          outageProxy.setDisconnected(value)
        }
        const page = context.pages().find((candidate) => !candidate.isClosed())
        if (page === undefined) throw new Error('Offline proof requires its live page.')
        if (value) {
          const checks = await page.evaluate<{
            apiBlocked: boolean
            uncachedStaticAbsent: boolean
            uncachedStaticBlocked: boolean
            cachedStatus: number
            cachedBytes: number
          }>(`(async () => {
              const build = document.querySelector('meta[name="offline-build"]').content
              const cache = await caches.open(build)
              const asset = (await cache.keys()).find(request =>
                new URL(request.url).pathname.startsWith('/assets/') && request.url.endsWith('.js'))
              if (asset === undefined) throw new Error('No prepared script is available for offline proof.')
              const uncached = new URL(asset.url)
              uncached.searchParams.set('offline-proof', crypto.randomUUID())
              const absent = (await caches.match(uncached.href, { ignoreVary: true })) === undefined
              const blocked = async url => {
                try { await fetch(url, { cache: 'no-store' }); return false }
                catch { return true }
              }
              const cached = await fetch(asset.url)
              return {
                apiBlocked: await blocked('/api/health'),
                uncachedStaticAbsent: absent,
                uncachedStaticBlocked: await blocked(uncached.href),
                cachedStatus: cached.status,
                cachedBytes: (await cached.arrayBuffer()).byteLength,
              }
            })()`)
          expect(checks).toMatchObject({
            apiBlocked: true,
            uncachedStaticAbsent: true,
            uncachedStaticBlocked: true,
            cachedStatus: 200,
          })
          expect(checks.cachedBytes).toBeGreaterThan(0)
        } else {
          const status = await page.evaluate<number>(
            "fetch('/api/health', { cache: 'no-store' }).then(response => response.status)",
          )
          expect(status).toBe(200)
        }
        if (outageProxy !== null) {
          // The proxy changes real connectivity but cannot emit the OS event.
          // Notify only after the transport assertions above; navigator stays untouched.
          await page.evaluate(`window.dispatchEvent(new Event('${value ? 'offline' : 'online'}'))`)
        }
      },
    })
  },
})
