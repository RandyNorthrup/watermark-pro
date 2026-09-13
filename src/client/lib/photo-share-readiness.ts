import { captureOfflineOwner, hasOfflineDatabase } from './offline-context'
import { pendingOperations } from './offline-database'
import type { OfflineChange } from './offline-model'

type PhotoShareReadiness = 'ready' | 'pending' | 'blocked'

function hasSelectedPhotos(change: OfflineChange, selected: ReadonlySet<string>): boolean {
  switch (change.kind) {
    case 'photo-upload': {
      return selected.has(change.photo.id)
    }
    case 'photo-delete': {
      return change.photoIds.some((id) => selected.has(id))
    }
    case 'photo-move': {
      return change.photos.some((photo) => selected.has(photo.id))
    }
    default: {
      return false
    }
  }
}

/** Only server-acknowledged selected photos may be published; unrelated work never blocks sharing. */
export async function photoShareReadiness(
  organizationId: string,
  photoIds: readonly string[],
): Promise<PhotoShareReadiness> {
  if (!hasOfflineDatabase()) return 'ready'
  const account = captureOfflineOwner()
  const operations = await pendingOperations(account.userId)
  account.assertCurrent()
  const selected = new Set(photoIds)
  const relevant = operations.filter(
    (operation) =>
      operation.organizationId === organizationId && hasSelectedPhotos(operation.change, selected),
  )
  if (relevant.some((operation) => operation.state !== 'pending')) return 'blocked'
  return relevant.length === 0 ? 'ready' : 'pending'
}
