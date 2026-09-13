import { ACCOUNT_CHANGED_EVENT } from './offline-account'
import { captureOfflineOwner } from './offline-context'

export const CLOUD_CONNECTION_CHANGED_EVENT = 'lumafoil:cloud-connection-changed'
const context = { generation: 0, isListening: false }

/** Provider replacement/disconnect invalidates pending cloud operations without altering photo edits. */
export function notifyCloudConnectionChanged(): void {
  window.dispatchEvent(new Event(CLOUD_CONNECTION_CHANGED_EVENT))
}

/** Capture both app-account identity and the lifetime of its current cloud connection selection. */
export function captureCloudOwner() {
  if (!context.isListening) {
    const changed = () => {
      context.generation += 1
    }
    window.addEventListener(ACCOUNT_CHANGED_EVENT, changed)
    window.addEventListener(CLOUD_CONNECTION_CHANGED_EVENT, changed)
    context.isListening = true
  }
  const owner = captureOfflineOwner()
  const generation = context.generation
  return {
    userId: owner.userId,
    assertCurrent() {
      owner.assertCurrent()
      if (generation !== context.generation)
        throw new Error('The cloud connection changed. Reopen the file browser to continue.')
    },
  }
}
