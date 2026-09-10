/** Observable sync state for the application shell; immutable snapshots suit useSyncExternalStore. */
interface OfflineStatus {
  pending: number
  blocked: number
  syncing: boolean
  problem: string | null
  isReady: boolean
  hasUpdate: boolean
  isOnline: boolean
}

const state: { status: OfflineStatus } = {
  status: {
    pending: 0,
    blocked: 0,
    syncing: false,
    problem: null,
    isReady: false,
    hasUpdate: false,
    isOnline: typeof navigator === 'undefined' || navigator.onLine,
  },
}
const listeners = new Set<() => void>()

export function offlineStatus(): OfflineStatus {
  return state.status
}

export function subscribeOfflineStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function updateOfflineStatus(patch: Partial<OfflineStatus>): void {
  state.status = { ...state.status, ...patch }
  for (const listener of listeners) {
    listener()
  }
}
