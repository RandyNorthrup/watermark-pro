/** Worker lifecycle failures and update controls are observable without altering an installed app. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { offlineStatus, updateOfflineStatus } from './offline-status'

beforeEach(() => {
  vi.resetModules()
  document.head.innerHTML = '<meta name="offline-build" content="build-a">'
  updateOfflineStatus({ isReady: false, hasUpdate: false, problem: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function workerRuntime() {
  const installing = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() })
  const waiting = { postMessage: vi.fn() }
  const controller = { postMessage: vi.fn() }
  const registration = Object.assign(new EventTarget(), {
    installing,
    waiting,
    update: vi.fn(() => Promise.resolve()),
  })
  const serviceWorker = Object.assign(new EventTarget(), {
    controller,
    register: vi.fn(() => Promise.resolve(registration)),
    ready: Promise.resolve(registration),
  })
  vi.stubGlobal('navigator', { serviceWorker })
  return { installing, waiting, controller, registration, serviceWorker }
}

describe('offline registration', () => {
  it('requires a matching active build before reporting ready, and only activates updates explicitly', async () => {
    const runtime = workerRuntime()
    const module = await import('./offline-registration')
    const status = await import('./offline-status')
    await module.registerOfflineWorker()
    expect(runtime.serviceWorker.register).toHaveBeenCalledWith('/sw.js')
    expect(status.offlineStatus().hasUpdate).toBe(true)
    expect(runtime.waiting.postMessage).not.toHaveBeenCalled()
    runtime.serviceWorker.dispatchEvent(
      new MessageEvent('message', { data: { type: 'offline-build', build: 'old-build' } }),
    )
    expect(status.offlineStatus().isReady).toBe(false)
    runtime.serviceWorker.dispatchEvent(
      new MessageEvent('message', { data: { type: 'offline-build', build: 'build-a' } }),
    )
    expect(status.offlineStatus().isReady).toBe(true)
    module.applyOfflineUpdate()
    expect(runtime.waiting.postMessage).toHaveBeenCalledWith({ type: 'activate-update' })
  })
  it('reports a failed installation and retries the current registration without deleting local data', async () => {
    const runtime = workerRuntime()
    const module = await import('./offline-registration')
    const status = await import('./offline-status')
    await module.registerOfflineWorker()
    runtime.registration.dispatchEvent(new Event('updatefound'))
    runtime.installing.state = 'redundant'
    runtime.installing.dispatchEvent(new Event('statechange'))
    expect(status.offlineStatus().problem).toContain('could not finish downloading')
    await module.retryOfflineWorker()
    expect(runtime.registration.update).toHaveBeenCalledOnce()
    runtime.registration.update.mockRejectedValue(new TypeError('Offline'))
    await module.retryOfflineWorker()
    expect(status.offlineStatus().problem).toContain('Reconnect and try again')
  })
  it('surfaces registration errors and safely ignores unsupported browsers', async () => {
    const runtime = workerRuntime()
    runtime.serviceWorker.register.mockRejectedValue(new TypeError('Storage unavailable'))
    const module = await import('./offline-registration')
    const status = await import('./offline-status')
    await module.retryOfflineWorker()
    expect(status.offlineStatus().problem).toContain('could not be downloaded')
    vi.stubGlobal('navigator', {})
    await module.registerOfflineWorker()
    module.applyOfflineUpdate()
    expect(runtime.waiting.postMessage).not.toHaveBeenCalled()
    expect(offlineStatus().isReady).toBe(false)
  })
})
