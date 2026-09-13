import { captureOfflineOwner, hasOfflineDatabase } from './offline-context'
import {
  commitOfflineChange,
  offlineOperations,
  offlineRecordKey,
  readOfflineRecord,
} from './offline-database'
import { replayFolderChange } from './offline-folder-replay'
import { offlineChangeSchema } from './offline-model'
import { refreshOfflineStatus } from './offline-sync'
import { mergeLocalPhotos, mergeLocalPresets } from './offline-workspace'
import { photoListResponseSchema, type PhotoDto } from '../../shared/api'
import { watermarkListResponseSchema, type WatermarkDto } from '../../shared/api-watermark'
import { folderDtoSchema, type FolderDto, type FolderKind } from '../../shared/folders'

type FolderChange = Parameters<typeof replayFolderChange>[0]['change']

/** One durable journal keeps parent creation before child creation, saves, and later moves. */
export async function saveFolderChange(
  organizationId: string,
  change: FolderChange,
): Promise<FolderChange> {
  const owner = captureOfflineOwner()
  let entities: readonly { organizationId: string }[]
  if ('folder' in change) entities = [change.folder]
  else if (change.kind === 'photo-move') entities = change.photos
  else entities = change.presets
  if (entities.some((entity) => entity.organizationId !== organizationId))
    throw new Error('The selected item belongs to another workspace.')
  offlineChangeSchema.parse(change)
  let id: string
  if (change.kind === 'folder-create' || change.kind === 'folder-update')
    id = change.folder.versionId
  else if (change.kind === 'folder-delete') id = crypto.randomUUID()
  else {
    const first = change.placements[0]
    if (
      first === undefined ||
      change.placements.some((placement) => placement.folderVersionId !== first.folderVersionId)
    )
      throw new Error('A move needs one shared operation version.')
    id = first.folderVersionId
  }
  if (!hasOfflineDatabase())
    return await replayFolderChange({ id, organizationId, change }, owner.assertCurrent)
  await commitOfflineChange({
    id,
    userId: owner.userId,
    organizationId,
    change,
    state: 'pending',
    error: null,
  })
  owner.assertCurrent()
  await refreshOfflineStatus()
  owner.assertCurrent()
  window.dispatchEvent(new Event('watermark-pro:offline-change'))
  return change
}

/** Cached complete metadata plus the outbox gives accurate offline empty-folder checks. */
async function cachedPlacements(
  organizationId: string,
  kind: FolderKind,
): Promise<(PhotoDto | WatermarkDto)[] | null> {
  const owner = captureOfflineOwner()
  const root = `/api/orgs/${organizationId}`
  if (kind === 'preset') {
    const record = await readOfflineRecord(
      offlineRecordKey(owner.userId, organizationId, `${root}/watermarks`),
    )
    owner.assertCurrent()
    if (record?.userId !== owner.userId || record.organizationId !== organizationId) return null
    const response = watermarkListResponseSchema.parse(record.value)
    return await mergeLocalPresets(organizationId, response.watermarks, true)
  }
  const photos: PhotoDto[] = []
  const seen = new Set<string>()
  let path = `${root}/photos`
  for (;;) {
    if (seen.has(path)) throw new Error('Cached folder contents contain a repeated photo page.')
    seen.add(path)
    const record = await readOfflineRecord(offlineRecordKey(owner.userId, organizationId, path))
    owner.assertCurrent()
    if (record?.userId !== owner.userId || record.organizationId !== organizationId) return null
    const page = photoListResponseSchema.parse(record.value)
    photos.push(...page.photos)
    if (page.nextCursor === null) return await mergeLocalPhotos(organizationId, photos, true)
    path = `${root}/photos?cursor=${encodeURIComponent(page.nextCursor)}`
  }
}

/** Folder changes remain visible after reload until authoritative metadata has been cached. */
export async function mergeLocalFolders(
  organizationId: string,
  kind: FolderKind,
  remote: FolderDto[],
  isCached: boolean,
): Promise<FolderDto[]> {
  const owner = captureOfflineOwner()
  const operations = await offlineOperations(owner.userId)
  owner.assertCurrent()
  const folders = new Map(remote.map((folder) => [folder.id, folder]))
  for (const operation of operations) {
    if ((!isCached && operation.state === 'synced') || operation.organizationId !== organizationId)
      continue
    const { change } = operation
    if (!('folder' in change) || change.folder.kind !== kind) continue
    if (change.kind === 'folder-delete') folders.delete(change.folder.id)
    else folders.set(change.folder.id, change.folder)
  }
  const localItems = isCached ? await cachedPlacements(organizationId, kind) : null
  owner.assertCurrent()
  const values = folders.values().toArray()
  return values.map((folder) =>
    folderDtoSchema.parse({
      ...folder,
      childCount: values.filter((child) => child.parentId === folder.id).length,
      itemCount:
        localItems === null
          ? folder.itemCount
          : localItems.filter((item) => item.folderId === folder.id).length,
    }),
  )
}

/** Original source snapshots preserve the version expected by a move, even after a lost acknowledgment. */
export function movePlacements(
  organizationId: string,
  kind: FolderKind,
  items: readonly (PhotoDto | WatermarkDto)[],
  folderId: string | null,
  versionId: string,
) {
  return items.map((item) => ({
    id: item.id,
    organizationId,
    kind,
    folderId,
    folderRevision: item.folderRevision + 1,
    folderVersionId: versionId,
  }))
}
