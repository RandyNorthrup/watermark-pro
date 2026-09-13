/** Canonical adapters for local presets and photo saves; the existing UI keeps its data-access API. */
import { captureOfflineOwner, offlineUserId } from './offline-context'
import { commitOfflineChange, offlineOperations } from './offline-database'
import type { OfflineChange, PendingOperation } from './offline-model'
import { refreshOfflineStatus } from './offline-sync'
import { photoDtoSchema, type AssetDto, type PhotoDto } from '../../shared/api'
import {
  type SaveWatermarkRequest,
  type WatermarkDto,
  watermarkDtoSchema,
} from '../../shared/api-watermark'

async function saveChange(
  organizationId: string,
  id: string,
  change: OfflineChange,
): Promise<void> {
  const owner = captureOfflineOwner()
  const { userId } = owner
  await commitOfflineChange({ id, userId, organizationId, change, state: 'pending', error: null })
  owner.assertCurrent()
  await refreshOfflineStatus()
  window.dispatchEvent(new Event('watermark-pro:offline-change'))
}

/** An offline preset gets its final id before any photo refers to it. */
export async function savePresetLocally(
  organizationId: string,
  body: SaveWatermarkRequest,
  existing?: WatermarkDto,
): Promise<WatermarkDto> {
  const operationId = crypto.randomUUID()
  const now = new Date().toISOString()
  const didMove = body.folderId !== undefined && body.folderId !== existing?.folderId
  const folderVersionId =
    existing !== undefined && didMove ? operationId : (existing?.folderVersionId ?? null)
  const preset = watermarkDtoSchema.parse({
    id: existing?.id ?? operationId,
    organizationId,
    name: body.name,
    spec: body.spec,
    createdBy: existing?.createdBy ?? offlineUserId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    folderVersionId,
    folderId: body.folderId === undefined ? (existing?.folderId ?? null) : body.folderId,
    folderRevision: existing === undefined ? 0 : existing.folderRevision + (didMove ? 1 : 0),
  })
  const change: OfflineChange =
    existing === undefined
      ? { kind: 'preset-create', preset }
      : {
          kind: 'preset-update',
          preset,
          body: {
            ...body,
            expectedUpdatedAt: body.expectedUpdatedAt ?? existing.updatedAt,
            ...(body.folderId !== undefined && {
              expectedFolderRevision: body.expectedFolderRevision ?? existing.folderRevision,
              expectedFolderVersionId:
                body.expectedFolderVersionId === undefined
                  ? existing.folderVersionId
                  : body.expectedFolderVersionId,
            }),
          },
        }
  await saveChange(organizationId, operationId, change)
  return preset
}

/** Commit both binary outputs before reporting a gallery save. */
export async function savePhotoLocally(
  organizationId: string,
  photo: PhotoDto,
  blob: Blob,
  thumbnail: Blob,
): Promise<PhotoDto> {
  await saveChange(organizationId, photo.id, {
    kind: 'photo-upload',
    photo: photoDtoSchema.parse(photo),
    blob,
    thumbnail,
  })
  return photo
}

/** Local deletes remain visible as tombstones until a reconnect confirms the server change. */
export async function deleteLocally(
  organizationId: string,
  change: Extract<OfflineChange, { kind: 'preset-delete' | 'photo-delete' | 'logo-delete' }>,
): Promise<void> {
  await saveChange(organizationId, crypto.randomUUID(), change)
}

/** Online reads take remote state as authoritative; offline reads also include acknowledged local work. */
async function changesFor(
  organizationId: string,
  shouldIncludeSynced: boolean,
): Promise<PendingOperation[]> {
  const owner = captureOfflineOwner()
  const operations = await offlineOperations(owner.userId)
  owner.assertCurrent()
  return operations.filter(
    (operation) =>
      operation.organizationId === organizationId &&
      (shouldIncludeSynced || operation.state !== 'synced'),
  )
}

/** Pending local edits take precedence until the server acknowledges or resolves them. */
export async function mergeLocalPresets(
  organizationId: string,
  remote: WatermarkDto[],
  shouldIncludeSynced = !navigator.onLine,
): Promise<WatermarkDto[]> {
  const merged = new Map(remote.map((preset) => [preset.id, preset]))
  const operations = await changesFor(organizationId, shouldIncludeSynced)
  for (const operation of operations) applyPresetChange(merged, operation)
  return merged.values().toArray()
}

/** Gallery saves are visible immediately, without pretending that the upload has completed. */
export async function mergeLocalPhotos(
  organizationId: string,
  remote: PhotoDto[],
  shouldIncludeSynced = !navigator.onLine,
  shouldIncludeMissing = true,
): Promise<PhotoDto[]> {
  const merged = new Map(remote.map((photo) => [photo.id, photo]))
  const operations = await changesFor(organizationId, shouldIncludeSynced)
  for (const operation of operations) applyPhotoChange(merged, operation, shouldIncludeMissing)
  return merged
    .values()
    .toArray()
    .toSorted((first, second) => second.createdAt.localeCompare(first.createdAt))
}

/** Logos and drawn signatures share the same durable upload path as their dependent presets. */
export async function saveLogoLocally(
  organizationId: string,
  asset: AssetDto,
  blob: Blob,
): Promise<AssetDto> {
  await saveChange(organizationId, asset.id, { kind: 'logo-upload', asset, blob })
  return asset
}

/** Pending logo uploads are selectable before a connection returns. */
export async function mergeLocalAssets(
  organizationId: string,
  remote: AssetDto[],
  shouldIncludeSynced = !navigator.onLine,
): Promise<AssetDto[]> {
  const merged = new Map(remote.map((asset) => [asset.id, asset]))
  const operations = await changesFor(organizationId, shouldIncludeSynced)
  for (const { change } of operations) {
    if (change.kind === 'logo-upload') {
      merged.set(change.asset.id, change.asset)
    } else if (change.kind === 'logo-delete') {
      merged.delete(change.assetId)
    }
  }
  return merged.values().toArray()
}

function applyPresetChange(
  merged: Map<string, WatermarkDto>,
  { change, state }: PendingOperation,
): void {
  switch (change.kind) {
    case 'preset-create':
    case 'preset-update': {
      const current = merged.get(change.preset.id)
      if (
        state !== 'synced' ||
        current === undefined ||
        change.preset.updatedAt >= current.updatedAt
      ) {
        merged.set(change.preset.id, change.preset)
      }

      return
    }
    case 'preset-delete': {
      merged.delete(change.presetId)

      return
    }
    case 'preset-move': {
      for (const preset of change.presets) {
        const placement = change.placements.find((item) => item.id === preset.id)
        if (placement !== undefined)
          merged.set(preset.id, {
            ...(merged.get(preset.id) ?? preset),
            folderId: placement.folderId,
            folderRevision: placement.folderRevision,
            folderVersionId: placement.folderVersionId,
          })
      }

      return
    }
    // No default
  }
}

function applyPhotoChange(
  merged: Map<string, PhotoDto>,
  { change }: PendingOperation,
  shouldIncludeMissing: boolean,
): void {
  switch (change.kind) {
    case 'photo-upload': {
      if (shouldIncludeMissing || merged.has(change.photo.id))
        merged.set(change.photo.id, change.photo)

      return
    }
    case 'photo-delete': {
      for (const id of change.photoIds) {
        merged.delete(id)
      }

      return
    }
    case 'photo-move': {
      for (const photo of change.photos) {
        const placement = change.placements.find((item) => item.id === photo.id)
        if (placement !== undefined && (shouldIncludeMissing || merged.has(photo.id)))
          merged.set(photo.id, {
            ...(merged.get(photo.id) ?? photo),
            folderId: placement.folderId,
            folderRevision: placement.folderRevision,
            folderVersionId: placement.folderVersionId,
          })
      }

      return
    }
    // No default
  }
}
