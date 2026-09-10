/**
 * Watermark library data access: presets and logo assets for the active
 * organization. Queries are keyed under the organization so switching
 * organizations never shows another organization's library.
 */
import { queryOptions } from '@tanstack/react-query'

import { fetchJson, sendNoContent } from './api'
import { cachedWorkspaceJson } from './offline-cache'
import { captureOfflineOwner, hasOfflineDatabase, offlineUserId } from './offline-context'
import { workspaceCacheReconciliation } from './offline-reconciliation'
import {
  deleteLocally,
  mergeLocalAssets,
  mergeLocalPresets,
  savePresetLocally,
  saveLogoLocally,
} from './offline-workspace'
import { noteRecentWork } from './recent-work-events'
import { type AssetDto, assetDtoSchema, assetListResponseSchema } from '../../shared/api'
import {
  type SaveWatermarkRequest,
  type WatermarkDto,
  watermarkDtoSchema,
  watermarkListResponseSchema,
} from '../../shared/api-watermark'

const JSON_HEADERS = { 'content-type': 'application/json' }

function libraryPath(organizationId: string, suffix: string): string {
  return `/api/orgs/${organizationId}${suffix}`
}

export function libraryQueryKey(organizationId: string) {
  return ['organization', organizationId, 'library'] as const
}

export function watermarksQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...libraryQueryKey(organizationId), 'watermarks'],
    networkMode: 'always',
    queryFn: async () => {
      let isCached = false
      const reconcile = hasOfflineDatabase()
        ? await workspaceCacheReconciliation(organizationId, 'preset')
        : undefined
      const response = await cachedWorkspaceJson(
        organizationId,
        libraryPath(organizationId, '/watermarks'),
        watermarkListResponseSchema,
        async (value) =>
          await reconcile?.(
            value.watermarks.map((preset) => preset.id),
            true,
          ),
        () => {
          isCached = true
        },
      )
      return hasOfflineDatabase()
        ? await mergeLocalPresets(organizationId, response.watermarks, isCached)
        : response.watermarks
    },
  })
}

export function assetsQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...libraryQueryKey(organizationId), 'assets'],
    networkMode: 'always',
    queryFn: async () => {
      let isCached = false
      const reconcile = hasOfflineDatabase()
        ? await workspaceCacheReconciliation(organizationId, 'logo')
        : undefined
      const response = await cachedWorkspaceJson(
        organizationId,
        libraryPath(organizationId, '/assets'),
        assetListResponseSchema,
        async (value) =>
          await reconcile?.(
            value.assets.map((asset) => asset.id),
            true,
          ),
        () => {
          isCached = true
        },
      )
      return hasOfflineDatabase()
        ? await mergeLocalAssets(organizationId, response.assets, isCached)
        : response.assets
    },
  })
}

/** URL the browser can load a logo from; same origin, session cookie applies. */
export function assetFileUrl(organizationId: string, assetId: string): string {
  return libraryPath(organizationId, `/assets/${assetId}/file`)
}

export async function createWatermark(
  organizationId: string,
  body: SaveWatermarkRequest,
): Promise<WatermarkDto> {
  const owner = captureOfflineOwner()
  const saved = hasOfflineDatabase()
    ? await savePresetLocally(organizationId, body)
    : await fetchJson(libraryPath(organizationId, '/watermarks'), watermarkDtoSchema, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      })
  owner.assertCurrent()
  noteRecentWork(organizationId, { kind: 'preset', preset: saved })
  return saved
}

export async function updateWatermark(
  organizationId: string,
  watermarkId: string,
  body: SaveWatermarkRequest,
): Promise<WatermarkDto> {
  const owner = captureOfflineOwner()
  let saved: WatermarkDto
  if (hasOfflineDatabase()) {
    const list = await cachedWorkspaceJson(
      organizationId,
      libraryPath(organizationId, '/watermarks'),
      watermarkListResponseSchema,
    )
    const presets = await mergeLocalPresets(organizationId, list.watermarks)
    owner.assertCurrent()
    const existing = presets.find((preset) => preset.id === watermarkId)
    if (existing === undefined) {
      throw new Error('This preset is not available on this device.')
    }
    saved = await savePresetLocally(organizationId, body, existing)
  } else {
    saved = await fetchJson(
      libraryPath(organizationId, `/watermarks/${watermarkId}`),
      watermarkDtoSchema,
      { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) },
    )
  }
  owner.assertCurrent()
  noteRecentWork(organizationId, { kind: 'preset', preset: saved })
  return saved
}

export function deleteWatermark(organizationId: string, watermarkId: string): Promise<void> {
  if (hasOfflineDatabase()) {
    return deleteLocally(organizationId, { kind: 'preset-delete', presetId: watermarkId })
  }
  return sendNoContent(libraryPath(organizationId, `/watermarks/${watermarkId}`), {
    method: 'DELETE',
  })
}

export interface LogoUpload {
  file: File
  name: string
  width: number
  height: number
}

export function uploadLogo(organizationId: string, upload: LogoUpload): Promise<AssetDto> {
  if (hasOfflineDatabase()) {
    const asset = assetDtoSchema.parse({
      id: crypto.randomUUID(),
      organizationId,
      kind: 'logo',
      name: upload.name,
      contentType: upload.file.type,
      size: upload.file.size,
      width: upload.width,
      height: upload.height,
      createdBy: offlineUserId(),
      createdAt: new Date().toISOString(),
    })
    return saveLogoLocally(organizationId, asset, upload.file)
  }
  const form = new FormData()
  form.append('file', upload.file)
  form.append('name', upload.name)
  form.append('width', String(upload.width))
  form.append('height', String(upload.height))
  return fetchJson(libraryPath(organizationId, '/assets'), assetDtoSchema, {
    method: 'POST',
    body: form,
  })
}

export function deleteLogo(organizationId: string, assetId: string): Promise<void> {
  if (hasOfflineDatabase()) {
    return deleteLocally(organizationId, { kind: 'logo-delete', assetId })
  }
  return sendNoContent(libraryPath(organizationId, `/assets/${assetId}`), { method: 'DELETE' })
}
