import { queryOptions } from '@tanstack/react-query'

import { cachedWorkspaceJson } from './offline-cache'
import { captureOfflineOwner, hasOfflineDatabase } from './offline-context'
import { mergeLocalFolders, movePlacements, saveFolderChange } from './offline-folders'
import { workspaceCacheReconciliation } from './offline-reconciliation'
import { type PhotoDto, photoDtoSchema } from '../../shared/api'
import { type WatermarkDto, watermarkDtoSchema } from '../../shared/api-watermark'
import {
  contentMoveSchema,
  folderCreateSchema,
  folderDtoSchema,
  folderListSchema,
  folderUpdateSchema,
  type FolderDto,
  type FolderKind,
} from '../../shared/folders'

/** Account is already part of cache identity; workspace/kind keep every visible tree separate. */
function folderQueryKey(organizationId: string) {
  return ['organization', organizationId, 'folders'] as const
}

export function foldersQueryOptions(organizationId: string, kind: FolderKind) {
  return queryOptions({
    queryKey: [...folderQueryKey(organizationId), kind],
    networkMode: 'always',
    queryFn: async () => {
      let isCached = false
      const reconcile = hasOfflineDatabase()
        ? await workspaceCacheReconciliation(organizationId, 'folder', kind)
        : undefined
      const response = await cachedWorkspaceJson(
        organizationId,
        `/api/orgs/${organizationId}/folders?kind=${kind}`,
        folderListSchema,
        async (value) =>
          await reconcile?.(
            value.folders.map((folder) => folder.id),
            true,
          ),
        () => {
          isCached = true
        },
      )
      return hasOfflineDatabase()
        ? await mergeLocalFolders(organizationId, kind, response.folders, isCached)
        : response.folders
    },
  })
}

/** New folders receive their final ID before any offline save references them. */
export async function createFolder(
  organizationId: string,
  kind: FolderKind,
  name: string,
  parentId: string | null,
): Promise<FolderDto> {
  const owner = captureOfflineOwner()
  const input = folderCreateSchema.parse({ id: crypto.randomUUID(), kind, name, parentId })
  const now = new Date().toISOString()
  const folder = folderDtoSchema.parse({
    ...input,
    organizationId,
    createdBy: owner.userId,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    versionId: input.id,
    childCount: 0,
    itemCount: 0,
  })
  const result = await saveFolderChange(organizationId, { kind: 'folder-create', folder })
  owner.assertCurrent()
  if (!('folder' in result)) throw new Error('Folder creation returned an invalid result.')
  return result.folder
}

export async function updateFolder(
  folder: FolderDto,
  name: string,
  parentId: string | null,
): Promise<void> {
  const input = folderUpdateSchema.parse({
    name,
    parentId,
    expectedRevision: folder.revision,
    expectedVersionId: folder.versionId,
  })
  await saveFolderChange(folder.organizationId, {
    kind: 'folder-update',
    expectedRevision: folder.revision,
    expectedVersionId: folder.versionId,
    folder: {
      ...folder,
      name: input.name,
      parentId,
      revision: folder.revision + 1,
      versionId: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    },
  })
}

export async function deleteFolder(folder: FolderDto): Promise<void> {
  if (folder.childCount > 0 || folder.itemCount > 0)
    throw new Error('Move the items and subfolders before deleting this folder.')
  await saveFolderChange(folder.organizationId, { kind: 'folder-delete', folder })
}

export async function movePhotos(
  organizationId: string,
  photos: readonly PhotoDto[],
  folderId: string | null,
): Promise<void> {
  const normalized = photos.map((photo) => photoDtoSchema.parse(photo))
  contentMoveSchema.parse({
    kind: 'photo',
    folderId,
    items: normalized.map((photo) => ({
      id: photo.id,
      expectedFolderRevision: photo.folderRevision,
      expectedFolderVersionId: photo.folderVersionId,
    })),
  })
  await saveFolderChange(organizationId, {
    kind: 'photo-move',
    photos: normalized,
    folderId,
    placements: movePlacements(organizationId, 'photo', normalized, folderId, crypto.randomUUID()),
  })
}

export async function movePresets(
  organizationId: string,
  presets: readonly WatermarkDto[],
  folderId: string | null,
): Promise<void> {
  const normalized = presets.map((preset) => watermarkDtoSchema.parse(preset))
  contentMoveSchema.parse({
    kind: 'preset',
    folderId,
    items: normalized.map((preset) => ({
      id: preset.id,
      expectedFolderRevision: preset.folderRevision,
      expectedFolderVersionId: preset.folderVersionId,
    })),
  })
  await saveFolderChange(organizationId, {
    kind: 'preset-move',
    presets: normalized,
    folderId,
    placements: movePlacements(organizationId, 'preset', normalized, folderId, crypto.randomUUID()),
  })
}
