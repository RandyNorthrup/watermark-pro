import { captureOfflineOwner } from './offline-context'
import { pendingOperations } from './offline-database'
import { updateOfflineStatus } from './offline-status'

/** Refresh the status even when offline, so restored work is visible before a network request. */
export async function refreshOfflineStatus(): Promise<number> {
  const owner = captureOfflineOwner()
  const operations = await pendingOperations(owner.userId)
  owner.assertCurrent()
  updateOfflineStatus({
    pending: operations.length,
    blocked: operations.filter((op) => op.state !== 'pending').length,
  })
  return operations.length
}
