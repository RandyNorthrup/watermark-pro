/** Retire acknowledged overlays only after an authoritative list has been durably refreshed. */
import { captureOfflineOwner } from './offline-context'
import { offlineOperations, offlineRecordKey, retireOfflineOperations } from './offline-database'
import type { CachedRecord, PendingOperation } from './offline-model'

type CollectionKind = 'preset' | 'photo' | 'logo'

function mediaFiles(operation: PendingOperation): { id: string; path: string; blob: Blob }[] {
  const root = `/api/orgs/${operation.organizationId}`
  const { change } = operation
  if (change.kind === 'photo-upload') {
    return [
      { id: change.photo.id, path: `${root}/photos/${change.photo.id}/file`, blob: change.blob },
      {
        id: change.photo.id,
        path: `${root}/photos/${change.photo.id}/thumbnail`,
        blob: change.thumbnail,
      },
    ]
  }
  return change.kind === 'logo-upload'
    ? [{ id: change.asset.id, path: `${root}/assets/${change.asset.id}/file`, blob: change.blob }]
    : []
}

function deletedMediaPaths(operation: PendingOperation, ids: string[]): string[] {
  const root = `/api/orgs/${operation.organizationId}`
  const { change } = operation
  if (change.kind === 'photo-delete') {
    return change.photoIds.flatMap((id) =>
      ids.includes(id) ? [] : [`${root}/photos/${id}/file`, `${root}/photos/${id}/thumbnail`],
    )
  }
  return change.kind === 'logo-delete' && !ids.includes(change.assetId)
    ? [`${root}/assets/${change.assetId}/file`]
    : []
}

/** Snapshot before the request, so an acknowledgement racing the response cannot be discarded. */
export async function workspaceCacheReconciliation(
  organizationId: string,
  kind: CollectionKind,
): Promise<(ids: string[], isComplete: boolean) => Promise<void>> {
  const owner = captureOfflineOwner()
  const operations = await offlineOperations(owner.userId)
  owner.assertCurrent()
  const confirmed = operations.filter(
    (operation) =>
      operation.organizationId === organizationId &&
      operation.state === 'synced' &&
      operation.change.kind.startsWith(`${kind}-`),
  )
  return async (ids, isComplete) => {
    owner.assertCurrent()
    // Absence from a filtered or paginated page does not prove remote deletion.
    const observed = confirmed.filter(
      (operation) => isComplete || mediaFiles(operation).some((file) => ids.includes(file.id)),
    )
    if (observed.length === 0) {
      return
    }
    const records: CachedRecord[] = []
    const removedKeys: string[] = []
    for (const operation of observed) {
      removedKeys.push(
        ...deletedMediaPaths(operation, ids).map((path) =>
          offlineRecordKey(owner.userId, organizationId, path),
        ),
      )
      for (const file of mediaFiles(operation)) {
        const key = offlineRecordKey(owner.userId, organizationId, file.path)
        if (ids.includes(file.id)) {
          records.push({ key, userId: owner.userId, organizationId, value: file.blob })
        } else {
          removedKeys.push(key)
        }
      }
    }
    await retireOfflineOperations(
      observed.map((operation) => operation.sequence),
      records,
      removedKeys,
    )
    owner.assertCurrent()
  }
}
