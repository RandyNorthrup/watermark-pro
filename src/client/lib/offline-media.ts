/** Private media bytes are cached in account-scoped IndexedDB, never in the public asset cache. */
import { apiRequest } from './api'
import { captureOfflineOwner, hasOfflineDatabase } from './offline-context'
import {
  cacheOfflineRecord,
  offlineOperations,
  offlineRecordKey,
  readOfflineRecord,
} from './offline-database'
import type { PendingOperation } from './offline-model'
import { updateOfflineStatus } from './offline-status'

interface MediaIdentity {
  id: string
  kind: 'assets' | 'photos'
  variant: 'file' | 'thumbnail'
}

function mediaIdentity(organizationId: string, path: string): MediaIdentity {
  const match = /^\/api\/orgs\/([^/]+)\/(assets|photos)\/([^/]+)\/(file|thumbnail)$/.exec(path)
  if (
    match?.[1] !== organizationId ||
    match[3] === undefined ||
    (match[2] !== 'assets' && match[2] !== 'photos') ||
    (match[4] !== 'file' && match[4] !== 'thumbnail') ||
    (match[2] === 'assets' && match[4] !== 'file')
  ) {
    throw new Error('This image does not belong to the requested workspace.')
  }
  return { id: match[3], kind: match[2], variant: match[4] }
}

/** A later tombstone always wins; acknowledged uploads never bypass an online authorization check. */
function localMedia(
  operations: PendingOperation[],
  organizationId: string,
  media: MediaIdentity,
  shouldIncludeSynced: boolean,
): Blob | undefined {
  for (const operation of operations.toReversed()) {
    if (
      operation.organizationId !== organizationId ||
      (!shouldIncludeSynced && operation.state === 'synced')
    ) {
      continue
    }
    const { change } = operation
    if (
      (media.kind === 'photos' &&
        change.kind === 'photo-delete' &&
        change.photoIds.includes(media.id)) ||
      (media.kind === 'assets' && change.kind === 'logo-delete' && change.assetId === media.id)
    ) {
      throw new Error('This image has been deleted from this workspace.')
    }
    if (media.kind === 'photos' && change.kind === 'photo-upload' && change.photo.id === media.id) {
      return media.variant === 'thumbnail' ? change.thumbnail : change.blob
    }
    if (media.kind === 'assets' && change.kind === 'logo-upload' && change.asset.id === media.id) {
      return change.blob
    }
  }
  return undefined
}

/** Load a durable local export, fetch an authorized remote file, or read its last downloaded bytes offline. */
export async function loadWorkspaceMedia(organizationId: string, path: string): Promise<Blob> {
  const media = mediaIdentity(organizationId, path)
  if (!hasOfflineDatabase()) {
    const response = await apiRequest(path)
    return await response.blob()
  }
  const owner = captureOfflineOwner()
  const { userId } = owner
  const key = offlineRecordKey(userId, organizationId, path)
  const operations = await offlineOperations(userId)
  owner.assertCurrent()
  const pending = localMedia(operations, organizationId, media, !navigator.onLine)
  if (pending !== undefined) {
    return pending
  }
  try {
    if (!navigator.onLine) {
      throw new TypeError('The device is offline.')
    }
    const response = await apiRequest(path)
    const blob = await response.blob()
    owner.assertCurrent()
    try {
      await cacheOfflineRecord({ key, userId, organizationId, value: blob })
    } catch {
      updateOfflineStatus({
        problem: 'Device storage is unavailable. This image was not saved for offline use.',
      })
    }
    owner.assertCurrent()
    return blob
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error
    }
    owner.assertCurrent()
    const acknowledged = localMedia(operations, organizationId, media, true)
    if (acknowledged !== undefined) {
      return acknowledged
    }
    const cached = await readOfflineRecord(key)
    owner.assertCurrent()
    if (
      cached?.userId !== userId ||
      cached.organizationId !== organizationId ||
      !(cached.value instanceof Blob)
    ) {
      throw new Error('Connect to download this image for offline use.', { cause: error })
    }
    return cached.value
  }
}
