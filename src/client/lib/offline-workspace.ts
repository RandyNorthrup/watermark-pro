/** Canonical adapters for local presets and photo saves; the existing UI keeps its data-access API. */
import { captureOfflineOwner, offlineUserId } from './offline-context'
import { commitOfflineChange, offlineOperations } from './offline-database'
import type { OfflineChange, PendingOperation } from './offline-model'
import { refreshOfflineStatus } from './offline-sync'
import type { AssetDto, PhotoDto } from '../../shared/api'
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
  const preset = watermarkDtoSchema.parse({
    id: existing?.id ?? operationId,
    organizationId,
    name: body.name,
    spec: body.spec,
    createdBy: existing?.createdBy ?? offlineUserId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
  const change: OfflineChange =
    existing === undefined
      ? { kind: 'preset-create', preset }
      : {
          kind: 'preset-update',
          preset,
          body: { ...body, expectedUpdatedAt: body.expectedUpdatedAt ?? existing.updatedAt },
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
  await saveChange(organizationId, photo.id, { kind: 'photo-upload', photo, blob, thumbnail })
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
  for (const { change, state } of operations) {
    if (change.kind === 'preset-create' || change.kind === 'preset-update') {
      const current = merged.get(change.preset.id)
      if (
        state !== 'synced' ||
        current === undefined ||
        change.preset.updatedAt >= current.updatedAt
      ) {
        merged.set(change.preset.id, change.preset)
      }
    } else if (change.kind === 'preset-delete') {
      merged.delete(change.presetId)
    }
  }
  return merged.values().toArray()
}

/** Gallery saves are visible immediately, without pretending that the upload has completed. */
export async function mergeLocalPhotos(
  organizationId: string,
  remote: PhotoDto[],
  shouldIncludeSynced = !navigator.onLine,
): Promise<PhotoDto[]> {
  const merged = new Map(remote.map((photo) => [photo.id, photo]))
  const operations = await changesFor(organizationId, shouldIncludeSynced)
  for (const { change } of operations) {
    if (change.kind === 'photo-upload') {
      merged.set(change.photo.id, change.photo)
    } else if (change.kind === 'photo-delete') {
      for (const id of change.photoIds) {
        merged.delete(id)
      }
    }
  }
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
