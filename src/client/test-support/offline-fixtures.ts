/** Synthetic local-workspace records shared by the browser persistence and replay tests. */
import { type AssetDto, assetDtoSchema, type PhotoDto } from '../../shared/api'
import type { WatermarkDto } from '../../shared/api-watermark'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import type { NewOperation, OfflineChange } from '../lib/offline-model'

export const OFFLINE_USER = 'offline-owner'
export const OFFLINE_ORG = 'offline-studio'
export const OFFLINE_DATE = '2026-09-08T00:00:00.000Z'

export function offlinePreset(name = 'Saved preset'): WatermarkDto {
  return {
    id: crypto.randomUUID(),
    organizationId: OFFLINE_ORG,
    name,
    spec: DEFAULT_TEXT_SPEC,
    createdBy: OFFLINE_USER,
    createdAt: OFFLINE_DATE,
    updatedAt: OFFLINE_DATE,
  }
}

export function offlinePhoto(): PhotoDto {
  return {
    id: crypto.randomUUID(),
    organizationId: OFFLINE_ORG,
    name: 'saved-photo.png',
    contentType: 'image/png',
    size: 4,
    width: 1,
    height: 1,
    presetId: null,
    presetName: null,
    createdBy: OFFLINE_USER,
    createdAt: OFFLINE_DATE,
  }
}

export function offlineOperation(
  change: OfflineChange,
  organizationId = OFFLINE_ORG,
): NewOperation {
  let id: string = crypto.randomUUID()
  switch (change.kind) {
    case 'preset-create': {
      id = change.preset.id

      break
    }
    case 'photo-upload': {
      id = change.photo.id

      break
    }
    case 'logo-upload': {
      id = change.asset.id

      break
    }
    // No default
  }
  return { id, userId: OFFLINE_USER, organizationId, state: 'pending', error: null, change }
}

export function offlineAsset(): AssetDto {
  return assetDtoSchema.parse({ ...offlinePhoto(), kind: 'logo' })
}
