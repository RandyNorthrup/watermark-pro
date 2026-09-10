/** Install complete offline resources and apply updates only when the user elects to reload. */
import { updateOfflineStatus } from './offline-status'

const state: { registration: ServiceWorkerRegistration | null; shouldReload: boolean } = {
  registration: null,
  shouldReload: false,
}
const listenedContainers = new WeakSet<ServiceWorkerContainer>()

function reportReady(): void {
  updateOfflineStatus({ hasUpdate: state.registration?.waiting != null })
  const build = document.querySelector('meta[name="offline-build"]')?.getAttribute('content')
  const serviceWorker = window.navigator.serviceWorker
  if (build !== undefined && build !== null) {
    serviceWorker.controller?.postMessage({ type: 'client-ready', build })
    serviceWorker.controller?.postMessage({ type: 'get-build' })
  }
}

/** Register from the mounted app; repeated calls refresh readiness without duplicating listeners. */
export async function registerOfflineWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    if (state.registration === registration) {
      reportReady()
      return
    }
    state.registration = registration
    updateOfflineStatus({ hasUpdate: registration.waiting !== null })
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller !== null) {
          updateOfflineStatus({ hasUpdate: true })
        }
        if (worker.state === 'redundant') {
          updateOfflineStatus({
            problem:
              'Offline files could not finish downloading. Reconnect and choose Sync now to retry.',
          })
        }
      })
    })
    if (!listenedContainers.has(navigator.serviceWorker)) {
      listenedContainers.add(navigator.serviceWorker)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (state.shouldReload) {
          window.location.reload()
        } else {
          reportReady()
        }
      })
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
        const value = event.data
        if (
          typeof value !== 'object' ||
          value === null ||
          !('type' in value) ||
          value.type !== 'offline-build' ||
          !('build' in value)
        ) {
          return
        }
        const build = document.querySelector('meta[name="offline-build"]')?.getAttribute('content')
        updateOfflineStatus({ isReady: typeof build === 'string' && value.build === build })
      })
    }
    await navigator.serviceWorker.ready
    reportReady()
  } catch {
    updateOfflineStatus({
      problem: 'Offline files could not be downloaded. Keep the app open and reconnect to retry.',
    })
  }
}

/** A failed initial install or update can be retried without clearing device work. */
export async function retryOfflineWorker(): Promise<void> {
  if (state.registration === null) {
    await registerOfflineWorker()
    return
  }
  try {
    await state.registration.update()
    reportReady()
  } catch {
    updateOfflineStatus({
      problem: 'Offline files could not be downloaded. Reconnect and try again.',
    })
  }
}

/** Other tabs keep running; their old immutable assets remain cached until they finish. */
export function applyOfflineUpdate(): void {
  const waiting = state.registration?.waiting
  if (waiting !== undefined && waiting !== null) {
    state.shouldReload = true
    waiting.postMessage({ type: 'activate-update' })
  }
}
